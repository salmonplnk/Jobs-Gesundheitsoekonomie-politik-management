"""
Automatischer Job-Crawler für Schweizer Gesundheits­portale.
Speichert pro Quelle max. 3 aktuelle Angebote in jobs-data.json.
"""

import json
import re
import datetime
from collections import defaultdict
from urllib.parse import urljoin

import requests

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# --------  HIER DEINE SEITEN EINTRAGEN  ----------
SOURCES = [
    # id, url, selector (Job-Link), optional selector Ort & Pensum
    (
        "bag",
        "https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353&limit=20#/shortlist",
        "a.job-list-item",
        None,
        None,
    ),
    ("obsan", "https://www.obsan.admin.ch/de/das-obsan/offene-stellen",
              "div.view-content a", None,             None),
    ("gfs",   "https://gesundheitsfoerderung.ch/stiftung/stellenangebote",
              "div.job-listing a",  "span.jobplace",  "span.scope"),
    (
        "lungenliga",
        "https://www.lungenliga.ch/ueber-uns/jobs",
        None,
        None,
        None,
    ),
    (
        "krebsliga",
        "https://www.krebsliga.ch/ueber-uns/jobs",
        "a.title[href^=\"https://link.ostendis.com\"]",
        "span.job-place",
        "span.pensum",
    ),
    # … weitere Zeilen nach gleichem Muster …
]
# -------------------------------------------------

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JobBot/1.0)"}
out = defaultdict(list)

def clean(txt): return re.sub(r"\s+", " ", txt).strip()


def fetch_lungenliga():
    url = (
        "https://www.lungenliga.ch/views/ajax?q=https://www.lungenliga.ch/ueber-"
        "uns/jobs&f%5B1%5D=languages%3Ade&_wrapper_format=drupal_ajax&view_name="
        "search_jobs&view_display_id=block"
    )
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    try:
        payload = r.json()
    except Exception as e:
        raise RuntimeError("invalid JSON") from e
    html = "".join(
        part.get("data", "") for part in payload if isinstance(part, dict)
    )
    soup = BeautifulSoup(html, "lxml")
    jobs = []
    for a in soup.select("a")[:3]:
        title = clean(a.get_text())
        href = a.get("href", "")
        if href and not href.startswith("http"):
            href = urljoin("https://www.lungenliga.ch", href)
        jobs.append({"title": title or "Job", "url": href, "location": "", "pensum": "-"})
    return jobs

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(extra_http_headers=HEADERS, ignore_https_errors=True)
    page = context.new_page()

    for id_, url, sel_link, sel_loc, sel_pen in SOURCES:
        try:
            if id_ == "lungenliga":
                out[id_].extend(fetch_lungenliga())
                print(f"✓ {id_}: {len(out[id_])} Einträge")
                continue

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