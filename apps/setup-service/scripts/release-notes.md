# Velvet 1.0.0

## What this update changes

Your page is published in one of four themes, chosen during the setup or named as `theme` in your configuration. Each theme brings its own appearance and its own typefaces with it, so a published page asks nobody else for a font, and each says for itself what can be set on it.

There is a configurator at `setup.velvet.li/config`. It shows your page beside the settings, live, at full size. Everything you set stays in your browser until you press Publish, which writes it into your own `velvet.yml` as a single commit and leaves the rest of that file exactly as you wrote it.

Reading the response times follows the pointer without lagging behind it, and a page starts in the colours it ends in rather than repainting once the browser has read its configuration. A service name too long for the line it stands on is shown cut rather than broken off mid-letter.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
