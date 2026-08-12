# Changelog

## Version 1.1.0 (2026-08-12)

The Cassette design is now built as the machine it emulates.

Its readout is a real dot-matrix panel: one character size, brightness as the only difference between what it says and what it says it about, and a grid of separate five-by-nine cells with every character standing on exactly one of them. The panel takes whole cells and nothing beyond them, with the same margin of metal on all four sides.

The sun above the services is symmetric, its five colours are the ones the readings below are drawn in, and the page's name is lettered across its middle band.

The days of a service are sunk into the faceplate rather than sitting on it, the day under the pointer lights up instead of standing up, and a day nothing was measured on is the plate barely lifted. The service name is cut in brass that stays brass at every point of its depth: it used to go almost black in the middle, where the eye reads it.

The screws that close a faceplate stand in the middle of their plate and their sockets sit concentric with their heads.

A design can now say how its strip is read and what the day under the pointer does. The three other designs say nothing and are unchanged.

## Version 1.0.1 (2026-08-12)

A status page is now published in the design its configuration names.

Until now that name was lost on the way. Writing `statusPage.design` into your `velvet.yml` got you the page Velvet ships, and nothing said why. The check that reads a configuration takes it apart field by field, and this one field was never copied across.

The browser setup offers those four designs where it used to offer four colour palettes. Each one is shown with its name, the period it comes from, and a picture of a page published in it, and what you choose there is written as `design`.

The setup also stands in one column again, because the bar above the form began at a different edge from the form beneath it. The layer the setup is drawn on no longer tiles either: the shorthand that paints it puts back a property that had been set before it.

## Version 1.0.0 (2026-08-12)

Velvet watches your websites and tells the people who rely on them whether everything is working.

You give it a list of addresses. Every five minutes GitHub asks each one whether it answers, and four times a day it also notes how long that answer took. Out of this Velvet builds a page anybody can look at, so somebody wondering whether your service is down can find out without writing to you first.

When an address stops answering, Velvet opens an issue in your repository and marks that service as down on the page. When it answers again, the issue closes and the page says so. Work you have planned can be announced beforehand, and it shows up as a notice rather than as a fault.

The page keeps a record of what was found, so a visitor sees how things have been going and not only how they are right now. You choose how it looks, and it can live on an address of your own. There is no server to rent and nothing to keep running, because all of it happens inside GitHub. The addresses you watch and anything you keep secret stay in your repository and never appear on the published page.

Setting it up takes five steps in a browser and no file edited by hand.
