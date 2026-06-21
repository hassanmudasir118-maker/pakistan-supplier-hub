const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./db');
const { id } = require('../utils/ids');

const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (googleEnabled) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] && profile.emails[0].value;
        if (!email) return done(new Error('Google account has no public email.'));

        let user = db.get('SELECT * FROM users WHERE google_id = ? OR email = ?', [profile.id, email]);

        if (!user) {
          const newId = id('user');
          db.run(
            `INSERT INTO users (id, name, email, google_id, role, avatar_url, email_verified)
             VALUES (?, ?, ?, ?, 'customer', ?, 1)`,
            [newId, profile.displayName || 'New User', email, profile.id, profile.photos && profile.photos[0] ? profile.photos[0].value : null]
          );
          user = db.get('SELECT * FROM users WHERE id = ?', [newId]);
        } else if (!user.google_id) {
          db.run('UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?', [profile.id, user.id]);
        }
        return done(null, user);
      } catch (e) {
        return done(e);
      }
    }
  ));
}

module.exports = { passport, googleEnabled };
