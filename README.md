# Dark Star Adventurecast Wiki

Public, spoiler-safe campaign wiki for [Dark Star Adventurecast](https://darkstaradventures.com), built with [Quartz](https://quartz.jzhao.xyz/).

Content in `content/` only ever reflects what's aired publicly. It's generated from the private GM vault, filtered and rewritten to strip anything not yet revealed on the show — see `GM Notes/Public Wiki Plan.md` in the vault for the full process.

## Local development

```bash
npm ci
npx quartz build --serve
```

## Deploy

Pushing to the `v5` branch triggers `.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages.
