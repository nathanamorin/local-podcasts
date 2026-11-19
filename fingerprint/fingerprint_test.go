package fingerprint

import (
	"math"
	"testing"
)

// synthTone generates a sine wave sample buffer at the given sampleRate,
// frequency, and duration, scaled to a typical loud-PCM amplitude.
func synthTone(sampleRate int, freqHz float64, durSec float64, amplitude float64) []float32 {
	n := int(float64(sampleRate) * durSec)
	out := make([]float32, n)
	for i := 0; i < n; i++ {
		t := float64(i) / float64(sampleRate)
		out[i] = float32(amplitude * math.Sin(2*math.Pi*freqHz*t))
	}
	return out
}

func TestComputeFromSamples_SilenceSkipped(t *testing.T) {
	samples := make([]float32, targetSampleRate*10) // 10s of silence
	chunks := computeFromSamples(samples, targetSampleRate)
	if len(chunks) != 0 {
		t.Fatalf("expected 0 chunks for silence, got %d", len(chunks))
	}
}

func TestComputeFromSamples_ProducesExpectedChunkCount(t *testing.T) {
	// 11s of a loud tone: windows start at 0,2,4,6s (need start+5s <= 11s) -> 4 chunks.
	samples := synthTone(targetSampleRate, 440, 11, 10000)
	chunks := computeFromSamples(samples, targetSampleRate)
	if len(chunks) != 4 {
		t.Fatalf("expected 4 chunks, got %d", len(chunks))
	}
	for i, c := range chunks {
		wantStart := float64(i) * HopSec
		if c.StartSec != wantStart {
			t.Errorf("chunk %d: StartSec = %v, want %v", i, c.StartSec, wantStart)
		}
	}
}

func TestHammingDistance_IdenticalAudioMatchesAcrossOffset(t *testing.T) {
	// Build an "ad" tone segment, then embed it at two different absolute
	// offsets inside two otherwise-different longer buffers (simulating the
	// same ad inserted at different points in two episodes). There should
	// exist a chunk pair (one per buffer) with a small Hamming distance.
	ad := synthTone(targetSampleRate, 300, 5, 9000)

	episodeA := append(synthTone(targetSampleRate, 900, 3, 9000), ad...)
	episodeA = append(episodeA, synthTone(targetSampleRate, 1200, 3, 9000)...)

	episodeB := append(synthTone(targetSampleRate, 600, 4, 9000), ad...)
	episodeB = append(episodeB, synthTone(targetSampleRate, 1500, 2, 9000)...)

	chunksA := computeFromSamples(episodeA, targetSampleRate)
	chunksB := computeFromSamples(episodeB, targetSampleRate)
	if len(chunksA) == 0 || len(chunksB) == 0 {
		t.Fatalf("expected non-empty chunks, got %d and %d", len(chunksA), len(chunksB))
	}

	best := 64
	for _, a := range chunksA {
		for _, b := range chunksB {
			if d := HammingDistance(a.Hash, b.Hash); d < best {
				best = d
			}
		}
	}
	if best > 8 {
		t.Errorf("expected a near-matching chunk pair (hamming <= 8) across offsets, best was %d", best)
	}
}

func TestHammingDistance_DifferentContentDiffers(t *testing.T) {
	toneA := synthTone(targetSampleRate, 440, 11, 10000)
	toneB := synthTone(targetSampleRate, 3000, 11, 10000)

	chunksA := computeFromSamples(toneA, targetSampleRate)
	chunksB := computeFromSamples(toneB, targetSampleRate)
	if len(chunksA) == 0 || len(chunksB) == 0 {
		t.Fatalf("expected non-empty chunks")
	}

	d := HammingDistance(chunksA[0].Hash, chunksB[0].Hash)
	if d < 16 {
		t.Errorf("expected clearly different hashes (hamming >= 16) for different tones, got %d", d)
	}
}
