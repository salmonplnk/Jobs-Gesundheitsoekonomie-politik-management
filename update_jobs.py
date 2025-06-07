#!/usr/bin/env python3
"""
Automatischer Job-Crawler für Schweizer Gesundheits­portale.
Speichert pro Quelle max. 3 aktuelle Angebote in jobs-data.json.
"""

import json
import re
import datetime
from collections import defaultdict
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# --------  HIER DEINE SEITEN EINTRAGEN  ----------
SOURCES = [
    # id, url, selector (Job-Link), optional selector Ort & Pensum
    ("bag",
     "https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353&limit=20#/shortlist",
     "a.job-list-item",
     None,
     None),
    ("obsan", "https://www.obsan.admin.ch/de/das-obsan/offene-stellen",
              "div.view-content a", None,             None),
    ("gfs",   "https://gesundheitsfoerderung.ch/stiftung/stellenangebote",
              "div.job-listing a",  "span.jobplace",  "span.scope"),
    ("lungenliga", "https://www.lungenliga.ch/ueber-uns/jobs",
              "div.jobs-list a",    None,             None),
    ("krebsliga", "https://www.krebsliga.ch/ueber-uns/jobs",
              "ul.joblist li a",    "span.job-place", "span.pensum"),
    # … weitere Zeilen nach gleichem Muster …
]
# -------------------------------------------------

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JobBot/1.0)"}
out = defaultdict(list)

def clean(txt): return re.sub(r"\s+", " ", txt).strip()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(extra_http_headers=HEADERS, ignore_https_errors=True)
    page = context.new_page()

    for id_, url, sel_link, sel_loc, sel_pen in SOURCES:
        try:
            page.goto(url, timeout=30000)
            page.wait_for_load_state("networkidle")
            html = page.content()
            soup = BeautifulSoup(html, "lxml")

            links = soup.select(sel_link)[:3]   # max. 3
            for a in links:
                title = clean(a.get_text())
                href = a.get("href", "")
                if href and not href.startswith("http"):
                    href = urljoin(url, href)

                loc = clean(a.select_one(sel_loc).get_text()) if sel_loc and a.select_one(sel_loc) else ""
                pen = clean(a.select_one(sel_pen).get_text()) if sel_pen and a.select_one(sel_pen) else "–"

                out[id_].append({
                    "title": title or "Job",
                    "url": href,
                    "location": loc,
                    "pensum": pen,
                })
            print(f"✓ {id_}: {len(out[id_])} Einträge")
        except Exception as e:
            print(f"⚠️ {id_}: {e}")

    browser.close()

# JSON schreiben
with open("jobs-data.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f"jobs-data.json aktualisiert ({datetime.datetime.now():%d.%m.%Y %H:%M})")