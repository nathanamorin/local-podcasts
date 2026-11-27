package podcast

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// UserFavorite records that a given user has starred/favorited a podcast.
// UserID comes from the X-Auth-Request-User header injected by Istio's
// ext_authz gating (see pocket-id-sso.yaml / oauth2-proxy in
// k8s-deployment) - this is only meaningful for hosts actually gated
// behind Pocket ID SSO, so it's treated as an opaque string here rather
// than validated against any identity provider directly.
type UserFavorite struct {
	ID        uint      `json:"-" gorm:"primaryKey;autoIncrement"`
	UserID    string    `json:"user_id" gorm:"uniqueIndex:idx_user_favorites_user_podcast,priority:1"`
	PodcastID string    `json:"podcast_id" gorm:"uniqueIndex:idx_user_favorites_user_podcast,priority:2"`
	CreatedAt time.Time `json:"created_at"`
}

// ListUserFavorites returns the podcast IDs a user has favorited, most
// recently favorited first.
func ListUserFavorites(db *gorm.DB, userID string) ([]string, error) {
	var favorites []UserFavorite
	if err := db.Where("user_id = ?", userID).Order("created_at desc").Find(&favorites).Error; err != nil {
		return nil, err
	}
	ids := make([]string, len(favorites))
	for i, f := range favorites {
		ids[i] = f.PodcastID
	}
	return ids, nil
}

// AddUserFavorite marks podcastID as favorited by userID. Safe to call
// repeatedly - re-favoriting an already-favorited podcast is a no-op
// rather than an error.
func AddUserFavorite(db *gorm.DB, userID, podcastID string) error {
	return db.Clauses(clause.OnConflict{DoNothing: true}).Create(&UserFavorite{
		UserID:    userID,
		PodcastID: podcastID,
	}).Error
}

// RemoveUserFavorite un-favorites podcastID for userID. Safe to call
// repeatedly - un-favoriting something that isn't favorited is a no-op.
func RemoveUserFavorite(db *gorm.DB, userID, podcastID string) error {
	return db.Where("user_id = ? AND podcast_id = ?", userID, podcastID).Delete(&UserFavorite{}).Error
}
