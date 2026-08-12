# Changelog

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
