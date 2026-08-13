# Changelog

## Version 1.0.0 (2026-08-13)

Velvet watches your websites and tells the people who rely on them whether everything is working.

You give it a list of addresses. Every five minutes GitHub asks each one whether it answers, and four times a day it also notes how long that answer took. Out of this Velvet builds a page anybody can look at, so somebody wondering whether your service is down can find out without writing to you first.

When an address stops answering, Velvet opens an issue in your repository and marks that service as down on the page. When it answers again, the issue closes and the page says so. Work you have planned can be announced beforehand, and it shows up as a notice rather than as a fault.

The page keeps a record of what was found, so a visitor sees how things have been going and not only how they are right now. There is no server to rent and nothing to keep running, because all of it happens inside GitHub. The addresses you watch and anything you keep secret stay in your repository and never appear on the published page.

Setting it up takes five steps in a browser and no file edited by hand, and the page can live on an address of your own.

### How your page looks

Your page is published in one of four designs. You choose it during the setup, where each is shown with its name, the period it comes from, and a picture of a page published in it, or by naming it as `design` in your configuration. A design brings its own appearance and its own typefaces with it, so a published page asks nobody else for a font.

Retro Chassis is built as the machine it emulates. Its readout is a real dot-matrix panel: one character size, brightness as the only difference between what it says and what it says it about, and a grid of separate five-by-nine cells with every character standing on exactly one of them. The panel takes whole cells and nothing beyond them, with the same margin of metal on all four sides, and it stands off the walnut cheek beside it by what the key stands off the other one.

The days of a service are sunk into the faceplate rather than sitting on it, the day under the pointer lights up instead of standing up, and a day nothing was measured on is the plate barely lifted. The service name is cut in brass that stays brass at every point of its depth, and the key that opens a row is one brass lit three ways rather than three sets of colours. The screws that close a faceplate stand in the middle of their plate with their sockets concentric to their heads. The sun above the services is symmetric, its five colours are the ones the readings below are drawn in, and the page's name is lettered across its middle band.

A design can say how its strip is read and what the day under the pointer does. A name too long for the line it stands on is shown cut rather than broken off mid-letter.

### How your page behaves

Reading the response times follows the pointer without lagging behind it. Both drawings do their work once per frame rather than once per mouse event, and moving the pointer redraws the pointer alone instead of rebuilding the whole chart and filtering every measurement again for each pixel it travels.

A page starts in the colours it ends in, so one built before its first check has run does not repaint once the browser has read its configuration.

### What is credited

The typeface notices copied into every installation credit every face a design carries, and credit none that no design carries.
