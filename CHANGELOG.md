# Changelog

## Version 1.0.0 (2026-08-12)

Velvet watches your websites and tells the people who rely on them whether everything is working.

You give it a list of addresses. Every five minutes GitHub asks each one whether it answers, and four times a day it also notes how long that answer took. Out of this Velvet builds a page anybody can look at, so somebody wondering whether your service is down can find out without writing to you first.

When an address stops answering, Velvet opens an issue in your repository and marks that service as down on the page. When it answers again, the issue closes and the page says so. Work you have planned can be announced beforehand, and it shows up as a notice rather than as a fault.

The page keeps up to a year of history, comes in four designs, and can live on an address of your own. There is no server to rent and nothing to keep running, because all of it happens inside GitHub. The addresses you watch and anything you keep secret stay in your repository and never appear on the published page.

Setting it up takes five steps in a browser and no file edited by hand.
