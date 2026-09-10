# Agents.md file for ADayIn codebase

## Project Overview

A Day In XYZ is a travel blog and itinerary listing for tailored and tested day trips with realistic expectations on what you can achieve in one day.

This is a static site generated with Astro with content built from Sanity CMS. 
Sanity schema's and custom components are found in `sanity` and Astro code is found in `web`.

Sanity Studio and the Astro site are delivered via Cloudflare Pages.

## Development Process

1. Clarify and ask questions.
2. Investigate codebase and look for shared implementations so you don't reinvent the wheel.
3. Continue with development and testing.
4. Always review your own work thoroughly by looking at the uncommited git diff.

## Rules

- Don't commit, stash, or push anything unless explicitly asked.
- Use Bun always, never use NPM.
- Don't try to run the server, check if the ports are running (4321 for web) and (3333 for sanity) and connect via that.
- Don't try to connect to Sanity via the browser, it requires auth. Ask the user to troubleshoot.
