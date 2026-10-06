# Orbit — private, Vercel-ready personal profile

This version uses a server-side owner code and persistent storage. The public page is editable only after the code is checked by the server. Do not put a code in `public/`, `index.html`, or any browser-visible file.

## Start editing

Run `node setup.mjs` once, then add the manual setup key from `private/AUTHENTICATOR-SETUP.txt` to Microsoft Authenticator or another TOTP app. In Microsoft Authenticator choose **Add account → Other account**, then add it as a time-based one-time-password account. Never upload `private/` or commit it. Run `node server.mjs` for local preview and open `http://127.0.0.1:4173`. Click the white cross in the top-left and enter the current six-digit authenticator code. The editor opens immediately after successful login. The old owner code remains only as an emergency setup artifact and is not accepted once TOTP is configured.

- **Profile:** name, bio, avatar, location and captions.
- **Links:** add, remove, hide and reorder links and social accounts. Replace all example URLs with your own.
- **Glass:** presets, opacity, blur, saturation, reflections, borders, radii, type, alignment, width, link finish, glow strength and soft glow.
- **Media:** drag in multiple MP3/OGG/WAV files, reorder tracks, seek, pause, previous/next, repeat, mute, and volume. Spotify/YouTube embeds remain available.
- **More:** background blending, image backgrounds, rain/snow/stars, animation settings, widget visibility, cursor choices, grid snapping and Spotify “Listen along” link.

Drag the profile card or music player while the editor is open. Turn grid snapping off in More for pixel-level placement. Everything is saved as draft or published explicitly.

Changes preview instantly. **Save draft** stores a private server-side draft. **Publish** makes it public. The server keeps one previous published version for recovery. A concurrent-save check prevents an older tab from silently overwriting newer work.

## Deploy to Vercel

1. Install the Vercel CLI and log in, or import this folder as a Vercel project.
2. Create a **private** Vercel Blob store and connect it to the project. Vercel supplies `BLOB_READ_WRITE_TOKEN` (or OIDC variables).
3. Run `node setup.mjs` locally. Add the key from `private/AUTHENTICATOR-SETUP.txt` to Microsoft Authenticator or another TOTP app. Put the JSON contents from `private/VERCEL-SETUP.txt` into Vercel project environment variables as `CUSTOMIZATION_CODE_HASH`; set `APP_ORIGIN` to the exact HTTPS domain you will use.
4. Deploy with `vercel --prod` from this folder. Do not deploy `private/` or `.env` files.
5. Add the custom domain in Vercel and enable HTTPS. Test the cross, login, draft, publish, restore, and an audio upload.

Vercel is required for persistent hosted drafts and uploads in this version. The local Node server is included for development and can use disk storage when Vercel Blob is not configured.

## Images, music and cursors

Uploads are sent through an authenticated server route and stored in Vercel Blob. Audio responses support byte ranges so the browser's time bar can seek efficiently. External HTTPS media URLs also work if their server permits them.

Uploads are limited to 30 MB per file. Music starts only after a visitor presses play. Test your chosen media format on your target browsers.

Custom cursors should be small PNG images, ideally 32 × 32 pixels. Touch devices retain normal touch behavior. Reduced-motion system preferences are respected even if animations are enabled.

## Integrations and privacy

Any account can be added as a direct profile link. Spotify tracks, albums, playlists, episodes and shows, plus YouTube videos, can be embedded using their normal share URL. Providers may limit availability or require their own sign-in. These are links and media embeds, not authenticated account integrations. Live Discord presence, live activity feeds or private account data require an additional API service and are not included.

There are no analytics or external fonts. Optional external media and embeds contact their providers. The customization code is scrypt-hashed and stays server-side; sessions use an HttpOnly, SameSite cookie. Vercel Blob tokens stay in server environment variables. Never put API keys or private information in public profile settings.

The Spotify “Listen along” control is a safe link to the Spotify profile/playlist URL you enter. True live “currently playing” requires Spotify OAuth and a refresh token; those credentials cannot be put in a public HTML file. Add that integration only through a server-side OAuth flow and secrets if you want live playback state.

## Advanced edits

All public styling and behavior live in `public/`. Server routes and validation live in `lib/`. Use the editor for normal changes. Keep `private/`, `.env`, and Vercel environment values out of source control.
