# Provider contract

Each provider exports `name`, `detect(url)`, and `getMediaInfo(url, context)`. A provider may also expose `getPreview`, `getFormats`, and `download` when an authorized integration requires them. Providers must never bypass authentication, DRM, CAPTCHA, paywalls, or access controls.
