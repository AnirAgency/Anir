# raw-media

Drop camera originals here. Nothing in this directory is committed — it is
gitignored, and only the processed output in `public/media/` ships.

Expected filenames are set in `scripts/media.config.json`:

| Source | Becomes | Used by |
|---|---|---|
| `hero.mov` | `hero.av1.webm`, `hero.vp9.webm`, `hero.jpg` | Hero, behind the wordmark |
| `plate-01.mov` … `plate-04.mov` | `plate-0N.{av1,vp9}.webm`, `plate-0N.jpg` | Үйлчилгээ, one per discipline |
| `portrait-01.jpg` … `portrait-04.jpg` | `portrait-0N.{avif,webp,jpg}` | Баг |
| `og.jpg` | `og.{avif,webp,jpg}` | Link previews |

Shoot to the spec in BUILD-KIT Phase 00: 3–4s, locked-off camera, 720p max,
24fps, audio irrelevant (it is stripped). Portraits: same light, same crop, same
background, 3:4.

Then run `npm run media`. Trim points per clip live in the config.
