# Changelog

## Version 1.0.0 (2026-08-21)

Velvet watches your websites and tells the people who rely on them whether everything is working.

You give it a list of addresses. Every five minutes GitHub asks each one whether it answers, and four times a day it also notes how long that answer took. Out of this Velvet builds a page anybody can look at, so somebody wondering whether your service is down can find out without writing to you first.

When an address stops answering, Velvet opens an issue in your repository and marks that service as down on the page. When it answers again, the issue closes and the page says so. Work you have planned can be announced beforehand, and it shows up as a notice rather than as a fault.

The page keeps a record of what was found, so a visitor sees how things have been going and not only how they are right now. There is no server to rent and nothing to keep running, because all of it happens inside GitHub. The addresses you watch and anything you keep secret stay in your repository and never appear on the published page.

Setting it up takes five steps in a browser and no file edited by hand, and the page can live on an address of your own.

### How your page looks

Your page is published in one of four themes. You choose it during the setup, where each is shown with its name, the period it comes from, and a picture of a page published in it, or by naming it as `theme` in your configuration. A theme brings its own appearance and its own typefaces with it, so a published page asks nobody else for a font.

Retro Chassis is built as the machine it emulates. Its readout is a real dot-matrix panel: one character size, brightness as the only difference between what it says and what it says it about, and a grid of separate five-by-nine cells with every character standing on exactly one of them. The panel takes whole cells and nothing beyond them, with the same margin of metal on all four sides, and it stands off the walnut cheek beside it by what the key stands off the other one.

The days of a service are sunk into the faceplate rather than sitting on it, the day under the pointer lights up instead of standing up, and a day nothing was measured on is the plate barely lifted. The service name is cut in brass that stays brass at every point of its depth, and the key that opens a row is one brass lit three ways rather than three sets of colours. The screws that close a faceplate stand in the middle of their plate with their sockets concentric to their heads. The sun above the services is symmetric, its five colours are the ones the readings below are drawn in, and the page's name is lettered across its middle band.

A theme can say how its strip is read and what the day under the pointer does. A name too long for the line it stands on is shown cut rather than broken off mid-letter.

### Changing how it looks, without editing a file

Velvet has a configurator at `setup.velvet.li/config`. You sign in with the same account you set your page up with, choose which of your installations to work on, and see that page beside the settings, live, at full size.

You pick a theme from its picture rather than from a list of names, and underneath it stand the settings that theme offers. Each theme says for itself what can be set on it, so what you see is what that one can do and nothing else. Velvet offers thirteen settings, among them the colours of the day bars, the two protocol colours, the wash under the response curve, the width of the page, the backdrop with its clouds, and a choice of three palettes. Every change shows in the page beside you at once.

Everything you set stays in your browser until you press Publish. It survives a reload, and it is kept per theme, so trying another one and coming back finds your settings where you left them.

Publishing writes the theme and its settings into your own `velvet.yml` as a single commit, and your page rebuilds itself a minute or so later. Everything else in that file is left exactly as you wrote it, comments included. If the file has a shape Velvet cannot change without rewriting the rest of it, nothing is written and it says so.

### The first day

A page published an hour ago is nearly empty: a grey strip, an empty chart, and figures that read as though nothing had ever answered. It now says so, for its first day, so that emptiness reads as a page that has just started rather than as one that is broken.

The picture somebody sees when they share your address is drawn in the colours of the theme your page is published in. Until now every installation shared a picture in Velvet's own indigo, whatever it actually looked like.

A service opened before its first response time has been recorded keeps the shape of the chart it has nothing to draw in yet, rather than collapsing to a line of text.

### How your page behaves

Reading the response times follows the pointer without lagging behind it. Both drawings do their work once per frame rather than once per mouse event, and moving the pointer redraws the pointer alone instead of rebuilding the whole chart and filtering every measurement again for each pixel it travels.

A page starts in the colours it ends in, so one built before its first check has run does not repaint once the browser has read its configuration.

### What is credited

The typeface notices copied into every installation credit every face a theme carries, and credit none that no theme carries.
