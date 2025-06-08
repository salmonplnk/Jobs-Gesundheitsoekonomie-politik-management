#!/usr/bin/env python3
"""
Automatischer Job-Crawler für Schweizer Gesundheits-Portale

* Feste Quellen (Bundesämter, Stiftungen, Spitäler, Versicherer …)
* Kantons-Gesundheits­direktionen (AR AI BE BL BS LU SG SO SZ UR ZH)
* Speichert pro Quelle/Kanton max. 3 Jobs in jobs-data.json
"""
import json, re, datetime
from collections import defaultdict
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# ---------------------------------------------------------------------------
# 1) FESTE QUELLEN
# ---------------------------------------------------------------------------
SOURCES = [
    ("bag",  "https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353&limit=20#/shortlist",
             "a.job-list-item", None, None),
    ("bsv",  "https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083356&limit=20#/shortlist",
             "a.job-list-item", None, None),
    ("obsan","https://www.obsan.admin.ch/de/das-obsan/offene-stellen",
             "div.view-content a", None, None),
    ("gfs",  "https://gesundheitsfoerderung.ch/stiftung/stellenangebote",
             "div.job-listing a", "span.jobplace", "span.scope"),
    ("lungenliga","https://www.lungenliga.ch/ueber-uns/jobs",
             None, None, None),
    ("krebsliga","https://www.krebsliga.ch/ueber-uns/jobs",
             "a.title[href^=\"https://link.ostendis.com\"]", "span.job-place", "span.pensum"),
    ("swissmedic","https://www.swissmedic.ch/swissmedic/en/home/about-us/jobs.html",
             "div.mod-teaser a", None, None),
    ("kssg","https://jobs.h-och.ch/search/",
             "a.jobTitle-link","span.jobLocation",None),
    ("css", "https://jobs.css.ch/",
             "div#jobs-list a.job-title","span.place-of-work",None),
    ("usz","https://jobs.usz.ch/?lang=de",
             "a.job__link",None,None),
]

# ---------------------------------------------------------------------------
# 2) KANTONSPORTALE + Selektoren
# ---------------------------------------------------------------------------
KANTONE = {
    "AR": "https://ar.ch/verwaltung/departement-finanzen/personalamt/freie-stellen/",
    "AI": "https://www.ai.ch/themen/arbeiten-bei-der-kantonalen-verwaltung/offene-stellen-1",
    "BE": "https://www.gsi.be.ch/de/start/ueber-uns/offene-stellen.html",
    "BL": "https://www.baselland.ch/politik-und-behorden/direktionen/finanz-und-kirchendirektion/personalamt/jobs/offene-stellen/",
    "BS": "https://www.bs.ch/themen/arbeit-und-steuern/stellenbesetzung-arbeitslosigkeit/offene-stellen/offene-stellen-beim-kanton-basel-stadt",
    "LU": "https://stellen.lu.ch/",
    "SG": "https://www.sg.ch/ueber-den-kanton-st-gallen/arbeitgeber-kanton-stgallen/stellenportal.html",
    "SO": "https://karriere.so.ch/stellenmarkt/offene-stellen/",
    "SZ": "https://www.sz.ch/services/offene-stellen.html/8756-8761-10387",
    "UR": "https://www.ur.ch/stellen",
    "ZH": None,  # eigenes Solique-Portal
}

KANTON_FILTERS = {
    "AR": {"selector": "table tbody tr a[href*='stellenportal/']"},
    "AI": {"selector": "li.views-row a[href*='/stellenangebot/']"},
    "BE": {"selector": "iframe >> article a.teaser-job__link"},
    "BL": {"selector": "a.pua-job-listing__link"},
    "BS": {"selector": "table.jobtable tbody tr td:first-child a"},
    "LU": {"selector": "a.card[href^='/job/']"},
    "SG": {"selector": "a[href*='umantis.com']"},
    "SO": {"selector": "tr.job a[href*='details']"},
    "SZ": {"selector": "div#onlineContainer a[href*='/offene-stellen/']"},
    "UR": {"selector": "div#view-content a[href*='/stellenangebot/']"},
    "ZH": {"url": "https://live.solique.ch/KTZH/de/ORG60/",
           "selector": "a[href*='/KTZH/de/ORG60/']"},
}

# ---------------------------------------------------------------------------
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JobBot/1.0)"}
out: defaultdict[list] = defaultdict(list)
clean = lambda t: re.sub(r"\s+", " ", t or "").strip()

# ---------------- Spezial-Fetcher (vereinfacht) -----------------------------
def fetch_usz(page, url: str):
    page.goto(url, timeout=60000)
    page.wait_for_load_state("networkidle")
    soup = BeautifulSoup(page.content(), "lxml")
    jobs=[]
    for a in soup.select("a.job__link")[:3]:
        jobs.append({"title": clean(a.get_text()),
                     "url": urljoin(url, a["href"]),
                     "location":"ZH","pensum":"–"})
    return jobs

# ---------------------------------------------------------------------------
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page    = browser.new_page(extra_http_headers=HEADERS)

    # ---------------- 3) FESTE QUELLEN --------------------------------------
    for id_, url, sel_link, *_ in SOURCES:
        try:
            page.goto(url, timeout=60000)
            page.wait_for_load_state("networkidle")

            if id_ == "usz":
                out[id_]=fetch_usz(page,url); print(f"✓ {id_}: {len(out[id_])} Jobs"); continue

            soup = BeautifulSoup(page.content(), "lxml")
            for a in soup.select(sel_link)[:3]:
                title = clean(a.get_text())
                href  = a.get("href","")
                if href and not href.startswith("http"):
                    href = urljoin(url, href)
                out[id_].append({"title": title, "url": href,
                                 "location":"", "pensum":"–"})
            print(f"✓ {id_}: {len(out[id_])} Jobs")
        except Exception as e:
            print(f"⚠️ {id_}: {e}")

    # ---------------- 4) KANTONSPORTALE -------------------------------------
    positive = re.compile(r"(stellen|job|vac|emploi|bewerb)", re.I)
    negative = re.compile(r"(lehr|praktik|kontakt|publikation|service|abo)", re.I)

    for kt, base_url in KANTONE.items():
        cfg       = KANTON_FILTERS.get(kt, {})
        target    = cfg.get("url", base_url)
        selector  = cfg.get("selector")
        jobs      = []
        try:
            page.goto(target, timeout=60000)
            page.wait_for_load_state("networkidle")

            soup = BeautifulSoup(page.content(), "lxml")

            links = soup.select(selector) if selector else []
            if not links:  # Fallback-Heuristik
                links = [
                    a for a in soup.find_all("a", href=True)
                    if (positive.search(a["href"]) or positive.search(a.get_text()))
                    and not negative.search(a["href"])
                ]

            for a in links[:3]:
                title = clean(a.get_text())
                href  = a["href"]
                if href and not href.startswith("http"):
                    href = urljoin(target, href)
                if len(title) >= 6:
                    jobs.append({"title": title, "url": href,
                                 "location": kt, "pensum": "–"})
            out[kt.lower()] = jobs
            print(f"✓ {kt}: {len(jobs)} Jobs")
        except Exception as e:
            print(f"⚠️ {kt}: {e}")
            out[kt.lower()] = []

# ---------------- 5) JSON speichern -----------------------------------------
try:
    existing = json.load(open("jobs-data.json", encoding="utf-8"))
except FileNotFoundError:
    existing = {}
existing.update(out)
json.dump(existing, open("jobs-data.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)

print("✅ jobs-data.json aktualisiert –",
      datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
