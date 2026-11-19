// Package fingerprint computes overlapping-window audio fingerprints used to
// detect segments (e.g. ads) shared across podcast episodes.
//
// Design (see session plan for full rationale):
//   - Decode MP3 to mono PCM, downsample to ~11025Hz.
//   - Slide a 5s analysis window across the episode with a 2s hop (not a
//     non-overlapping grid) because ads are inserted at arbitrary offsets
//     per-episode — overlap gives shift-tolerant matching between two
//     episodes containing the same ad at different absolute positions.
//   - Each window is split into fixed-size (2048-sample) non-overlapping
//     sub-frames; each sub-frame is FFT'd (pure-Go radix-2, no external DSP
//     dependency) and its spectrum is binned into 32 log-spaced frequency
//     bands.
//   - The window's 64-bit hash packs two independent signals: 32
//     "spectral" bits (adjacent log-band energy comparisons of the
//     window-average spectrum) and 32 "temporal" bits (first-half vs.
//     second-half energy per band), Chromaprint-style — robust to absolute
//     loudness, sensitive to spectral shape and its evolution.
//   - Near-silent windows are skipped entirely so they don't produce
//     degenerate, trivially-matching hashes that would dominate
//     ad-candidate false positives.
package fingerprint

import (
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"math/bits"
	"math/cmplx"
	"os"
	"runtime"
	"sync"

	"github.com/hajimehoshi/go-mp3"
)

const (
	// WindowSec is the duration of each analysis window.
	WindowSec = 5.0
	// HopSec is the stride between successive window start times. Smaller
	// than WindowSec so windows overlap, which is what makes matching
	// tolerant of ads appearing at different absolute offsets per episode.
	HopSec = 2.0

	targetSampleRate = 11025
	frameSize        = 2048 // samples per FFT sub-frame (~186ms at 11025Hz)
	numBands         = 32   // must be 32 — each half of the uint64 hash holds one 32-bit bitmask
	minBandHz        = 80.0

	// silenceRMSThreshold is on the same scale as 16-bit PCM samples
	// (-32768..32767). Windows quieter than this are skipped.
	silenceRMSThreshold = 400.0
)

// Chunk is one hashed analysis window.
type Chunk struct {
	StartSec float64
	Hash     uint64
}

// ComputeFingerprints decodes the MP3 file at path and returns one Chunk per
// non-silent 5s/2s-hop window.
func ComputeFingerprints(path string) ([]Chunk, error) {
	samples, sampleRate, err := decodeMonoDownsampled(path, targetSampleRate)
	if err != nil {
		return nil, err
	}
	return computeFromSamples(samples, sampleRate), nil
}

// decodeMonoDownsampled decodes an MP3 file to mono (averaged channels),
// downsampled via simple block-averaging decimation to approximately
// targetRate. This is a crude (non-anti-aliased) downsample, acceptable here
// since fingerprinting only cares about coarse spectral shape well below the
// target Nyquist frequency.
func decodeMonoDownsampled(path string, targetRate int) ([]float32, int, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, 0, err
	}
	defer f.Close()

	d, err := mp3.NewDecoder(f)
	if err != nil {
		return nil, 0, fmt.Errorf("decode mp3: %w", err)
	}

	srcRate := d.SampleRate()
	decim := srcRate / targetRate
	if decim < 1 {
		decim = 1
	}
	actualRate := srcRate / decim

	const readSize = 16384
	buf := make([]byte, readSize)
	var carry []byte
	var out []float32
	var acc float64
	var accCount int
	var frameIdx int

	for {
		n, rerr := d.Read(buf)
		if n > 0 {
			data := buf[:n]
			if len(carry) > 0 {
				data = append(carry, data...)
				carry = nil
			}
			usable := len(data) - (len(data) % 4)
			for i := 0; i+4 <= usable; i += 4 {
				l := int16(binary.LittleEndian.Uint16(data[i : i+2]))
				r := int16(binary.LittleEndian.Uint16(data[i+2 : i+4]))
				acc += (float64(l) + float64(r)) / 2
				accCount++
				frameIdx++
				if frameIdx%decim == 0 {
					out = append(out, float32(acc/float64(accCount)))
					acc = 0
					accCount = 0
				}
			}
			if usable < len(data) {
				carry = append(carry, data[usable:]...)
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return nil, 0, fmt.Errorf("read pcm: %w", rerr)
		}
	}

	return out, actualRate, nil
}

// computeFromSamples is the pure DSP core, independent of file I/O, so it can
// be exercised directly in tests with synthetic signals.
func computeFromSamples(samples []float32, sampleRate int) []Chunk {
	if sampleRate <= 0 || len(samples) == 0 {
		return nil
	}

	windowSamples := int(WindowSec * float64(sampleRate))
	hopSamples := int(HopSec * float64(sampleRate))
	if windowSamples <= 0 || hopSamples <= 0 {
		return nil
	}

	framesPerWindow := windowSamples / frameSize
	if framesPerWindow < 2 {
		return nil // window too short to analyze meaningfully at this sample rate
	}

	hamming := hammingWindow(frameSize)

	var starts []int
	for start := 0; start+windowSamples <= len(samples); start += hopSamples {
		starts = append(starts, start)
	}
	if len(starts) == 0 {
		return nil
	}

	// Each window is independent (only reads from samples/hamming, which are
	// never mutated after this point), so windows are hashed concurrently
	// across a bounded worker pool. Results are written into a slice indexed
	// by window position and filtered back into order afterward, so output
	// is identical to the sequential version regardless of goroutine
	// completion order.
	results := computeWindowsParallel(samples, starts, windowSamples, framesPerWindow, sampleRate, hamming)

	var chunks []Chunk
	for _, c := range results {
		if c != nil {
			chunks = append(chunks, *c)
		}
	}
	return chunks
}

// computeWindowsParallel hashes each window (given by its start sample
// index) using up to GOMAXPROCS worker goroutines, returning one *Chunk per
// start index (nil for silent windows that are skipped), in the same order
// as starts.
func computeWindowsParallel(samples []float32, starts []int, windowSamples, framesPerWindow, sampleRate int, hamming []float64) []*Chunk {
	results := make([]*Chunk, len(starts))

	workers := runtime.GOMAXPROCS(0)
	if workers > len(starts) {
		workers = len(starts)
	}
	if workers < 1 {
		workers = 1
	}

	idxCh := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range idxCh {
				start := starts[i]
				windowSlice := samples[start : start+windowSamples]

				if rms(windowSlice) < silenceRMSThreshold {
					continue
				}

				bandsPerFrame := make([][]float64, framesPerWindow)
				for fi := 0; fi < framesPerWindow; fi++ {
					frame := windowSlice[fi*frameSize : (fi+1)*frameSize]
					bandsPerFrame[fi] = frameBandPowers(frame, hamming, sampleRate)
				}

				results[i] = &Chunk{
					StartSec: float64(start) / float64(sampleRate),
					Hash:     hashBands(bandsPerFrame),
				}
			}
		}()
	}

	for i := range starts {
		idxCh <- i
	}
	close(idxCh)
	wg.Wait()

	return results
}

func rms(samples []float32) float64 {
	var sumSq float64
	for _, s := range samples {
		v := float64(s)
		sumSq += v * v
	}
	return math.Sqrt(sumSq / float64(len(samples)))
}

func hammingWindow(n int) []float64 {
	w := make([]float64, n)
	for i := 0; i < n; i++ {
		w[i] = 0.54 - 0.46*math.Cos(2*math.Pi*float64(i)/float64(n-1))
	}
	return w
}

// frameBandPowers applies a Hamming window, FFTs the frame, and bins the
// magnitude spectrum into numBands log-spaced frequency bands.
func frameBandPowers(frame []float32, win []float64, sampleRate int) []float64 {
	n := len(frame)
	buf := make([]complex128, n)
	for i := 0; i < n; i++ {
		buf[i] = complex(float64(frame[i])*win[i], 0)
	}
	fft(buf)

	nyquist := float64(sampleRate) / 2
	maxBandHz := nyquist
	if maxBandHz <= minBandHz {
		maxBandHz = minBandHz + 1
	}
	edges := logSpace(minBandHz, maxBandHz, numBands+1)

	bands := make([]float64, numBands)
	bandBinCount := make([]int, numBands)
	for k := 1; k < n/2; k++ { // skip DC bin
		freq := float64(k) * float64(sampleRate) / float64(n)
		bi := bandIndex(freq, edges)
		if bi < 0 {
			continue
		}
		mag := cmplx.Abs(buf[k])
		bands[bi] += mag * mag
		bandBinCount[bi]++
	}
	for i := range bands {
		if bandBinCount[i] > 0 {
			bands[i] /= float64(bandBinCount[i])
		}
	}
	return bands
}

func logSpace(lo, hi float64, n int) []float64 {
	edges := make([]float64, n)
	logLo, logHi := math.Log(lo), math.Log(hi)
	for i := 0; i < n; i++ {
		t := float64(i) / float64(n-1)
		edges[i] = math.Exp(logLo + t*(logHi-logLo))
	}
	return edges
}

func bandIndex(freq float64, edges []float64) int {
	if freq < edges[0] || freq >= edges[len(edges)-1] {
		return -1
	}
	for i := 0; i < len(edges)-1; i++ {
		if freq >= edges[i] && freq < edges[i+1] {
			return i
		}
	}
	return -1
}

// hashBands packs 32 "spectral" bits (adjacent-band comparisons of the
// window-average spectrum) and 32 "temporal" bits (first-half vs.
// second-half per-band energy) into a single 64-bit fingerprint.
func hashBands(framesBands [][]float64) uint64 {
	numFrames := len(framesBands)

	avg := make([]float64, numBands)
	for _, fb := range framesBands {
		for i, v := range fb {
			avg[i] += v
		}
	}
	for i := range avg {
		avg[i] /= float64(numFrames)
	}

	half := numFrames / 2
	early := make([]float64, numBands)
	late := make([]float64, numBands)
	for fi, fb := range framesBands {
		target := early
		if fi >= half {
			target = late
		}
		for i, v := range fb {
			target[i] += v
		}
	}

	var hash uint64
	for i := 0; i < numBands; i++ {
		next := (i + 1) % numBands
		if avg[i] > avg[next] {
			hash |= 1 << uint(i)
		}
	}
	for i := 0; i < numBands; i++ {
		if early[i] > late[i] {
			hash |= 1 << uint(32+i)
		}
	}
	return hash
}

// fft is an in-place iterative radix-2 Cooley-Tukey FFT. len(a) must be a
// power of two (frameSize is fixed at 2048, so this always holds here).
func fft(a []complex128) {
	n := len(a)
	if n <= 1 {
		return
	}

	for i, j := 1, 0; i < n; i++ {
		bit := n >> 1
		for ; j&bit != 0; bit >>= 1 {
			j ^= bit
		}
		j ^= bit
		if i < j {
			a[i], a[j] = a[j], a[i]
		}
	}

	for length := 2; length <= n; length <<= 1 {
		ang := -2 * math.Pi / float64(length)
		wlen := cmplx.Rect(1, ang)
		for i := 0; i < n; i += length {
			w := complex(1.0, 0.0)
			for j := 0; j < length/2; j++ {
				u := a[i+j]
				v := a[i+j+length/2] * w
				a[i+j] = u + v
				a[i+j+length/2] = u - v
				w *= wlen
			}
		}
	}
}

// HammingDistance returns the number of differing bits between two 64-bit
// fingerprints, used by matching logic to decide whether two windows are
// "the same" audio despite minor spectral differences.
func HammingDistance(a, b uint64) int {
	return bits.OnesCount64(a ^ b)
}
