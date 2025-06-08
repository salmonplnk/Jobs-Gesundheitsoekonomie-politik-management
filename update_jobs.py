"""
Automatischer Job‑Crawler für Schweizer Gesundheits‑ und Gesundheits­direktions‑Portale.

* Besucht Bundesämter, Stiftungen, Spitäler **und alle 26 kantonalen Gesundheits­direktionen**.
* Speichert pro Quelle/Kanton maximal **3** aktuelle Angebote in **jobs‑data.json**.
* Vorhandene Einträge werden überschrieben/ergänzt, alles wird als JSON gespeichert.
"""

import json
import re
import datetime
from collections import defaultdict
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# ----------------------------------------------------------------------------
# 1) FESTE QUELLEN (Bundesstellen, Stiftungen, Versicherer, Spitäler …)
# ----------------------------------------------------------------------------
# id, url, selector (Job‑Link), optional selector Ort & Pensum
SOURCES = [
    (
        "bag",
        "https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353&limit=20#/shortlist",
        "a.job-list-item",
        None,
        None,
    ),
    (
        "bsv",
        "https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083356&limit=20#/shortlist",
        "a.job-list-item",
        None,
        None,
    ),
    (
        "obsan",
        "https://www.obsan.admin.ch/de/das-obsan/offene-stellen",
        "div.view-content a",
        None,
        None,
    ),
    (
        "gfs",
        "https://gesundheitsfoerderung.ch/stiftung/stellenangebote",
        "div.job-listing a",
        "span.jobplace",
        "span.scope",
    ),
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
    (
        "swissmedic",
        "https://www.swissmedic.ch/swissmedic/en/home/about-us/jobs.html",
        "div.mod-teaser a",
        None,
        None,
    ),
    (
        "kssg",
        "https://jobs.h-och.ch/search/",
        "a.jobTitle-link",
        "span.jobLocation",
        None,
    ),
    (
        "css",
        "https://jobs.css.ch/",
        "div#jobs-list a.job-title",
        "span.place-of-work",
        None,
    ),
    (
        "usz",
        "https://jobs.usz.ch/?lang=de",
        "a.job__link",
        None,
        None,
    ),
    # … weitere Zeilen nach gleichem Muster …
]

# ----------------------------------------------------------------------------
# 2) KANTONALE GESUNDHEITSDIREKTIONEN
# ----------------------------------------------------------------------------
KANTONE = {
    "AG": "https://www.ag.ch/de/verwaltung/gesundheitsdepartement/stellenangebote",
    "AI": "https://www.ai.ch/themen/arbeiten-bei-der-kantonalen-verwaltung/offene-stellen-1",
    "AR": "https://ar.ch/verwaltung/departement-finanzen/personalamt/freie-stellen/",
    "BE": "https://www.gef.be.ch/de/start/ueber-das-amt/stellenangebote.html",
    "BL": "https://www.bl.ch/stellenportal",
    "BS": "https://www.gesundheit.bs.ch/ueber-uns/offene-stellen.html",
    "FR": "https://www.fr.ch/de/gesundheit/gesundheitswesen/stellenangebote",
    "GE": "https://www.ge.ch/domaine/sante/emploi",
    "GL": "https://www.gl.ch/verwaltung/gesundheitsdirektion/offene-stellen.html/",
    "GR": "https://www.gr.ch/DE/institutionen/verwaltung/dvs/gdk/Seiten/OffeneStellen.aspx",
    "JU": "https://www.jura.ch/DIRECT/DSAS/Offres-d-emploi.html",
    "LU": "https://lu.ch/verwaltung/gesundheits-und-sozialdepartement/stellenangebote",
    "NE": "https://www.ne.ch/autorites/DFS/SAN/Pages/emplois.aspx",
    "NW": "https://www.nw.ch/gesundheitsamt/",
    "OW": "https://www.ow.ch/verwaltung/gesundheitsamt/",
    "SG": "https://www.sg.ch/gesundheit-soziales/gesundheitsamt/stellen.html",
    "SH": "https://sh.ch/Behoerden/Verwaltung/Gesundheitsamt/Offene-Stellen.html",
    "SO": "https://so.ch/verwaltung/departement-des-innern/amt-fuer-gesundheit/offene-stellen/",
    "SZ": "https://www.sz.ch/verwaltung/gesundheitsdepartement/gesundheitsamt/offene-stellen.html",
    "TG": "https://www.tg.ch/gesundheit.html/1331",
    "TI": "https://www4.ti.ch/dss/dsp/chi-siamo/lavora-con-noi/",
    "UR": "https://www.ur.ch/themen/910/14172",
    "VD": "https://www.vd.ch/themes/sante/offres-demploi/",
    "VS": "https://www.vs.ch/de/web/ssp/offres-d-emploi",
    "ZG": "https://www.zg.ch/behoerden/gesundheitsdirektion/stellenangebote",
    "ZH": "https://www.gd.zh.ch/internet/gesundheitsdirektion/gd/de/ueber-uns/stellen.html",
}

# ----------------------------------------------------------------------------
# 3) GLOBALS & HELPERS
# ----------------------------------------------------------------------------
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JobBot/1.0)"}
out: defaultdict[list] = defaultdict(list)

def clean(txt: str) -> str:
    """Entfernt Zeilenumbrüche/Mehrfach‑Leerzeichen."""
    return re.sub(r"\s+", " ", txt or "").strip()

# ---------------------------------------------------------------------------
# 4) SPEZIAL‑FETCHER FÜR EINZELNE PORTALE
# ---------------------------------------------------------------------------

def fetch_lungenliga():
    url = (
        "https://www.lungenliga.ch/views/ajax?q=https://www.lungenliga.ch/ueber-"
        "uns/jobs&f%5B1%5D=languages%3Ade&_wrapper_format=drupal_ajax&view_name="
        "search_jobs&view_display_id=block"
    )
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    payload = r.json()
    html = "".join(part.get("data", "") for part in payload if isinstance(part, dict))
    soup = BeautifulSoup(html, "lxml")
    jobs = []
    for a in soup.select("a")[:3]:
        title = clean(a.get_text())
        href = a.get("href", "")
        if href and not href.startswith("http"):
            href = urljoin("https://www.lungenliga.ch", href)
        jobs.append({"title": title or "Job", "url": href, "location": "", "pensum": "–"})
    return jobs

def fetch_kssg(url: str):
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    jobs = []
    for row in soup.select("tr.data-row")[:3]:
        a = row.select_one("a.jobTitle-link")
        if not a:
            continue
        title = clean(a.get_text())
        href = a.get("href", "")
        if href and not href.startswith("http"):
            href = urljoin(url, href)
        loc_el = row.select_one("span.jobLocation")
        loc = clean(loc_el.get_text()) if loc_el else ""
        jobs.append({"title": title or "Job", "url": href, "location": loc, "pensum": "–"})
    return jobs

def fetch_css(url: str):
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    jobs = []
    for div in soup.select("div#jobs-list div.job")[:3]:
        a = div.select_one("a.job-title")
        if not a:
            continue
        title = clean(a.get("title") or a.get_text())
        href = a.get("href", "")
        if href and not href.startswith("http"):
            href = urljoin(url, href)
        loc_el = div.select_one("span.place-of-work")
        loc = clean(loc_el.get_text()) if loc_el else ""
        jobs.append({"title": title or "Job", "url": href, "location": loc, "pensum": "–"})
    return jobs

def fetch_usz(page, url: str):
    page.goto(url, timeout=30000)
    page.wait_for_load_state("networkidle")
    soup = BeautifulSoup(page.content(), "lxml")
    jobs = []
    for a in soup.select("a.job__link")[:3]:
        title = clean(a.get_text())
        href = a.get("href", "")
        if href and not href.startswith("http"):
            href = urljoin(url, href)
        jobs.append({"title": title or "Job", "url": href, "location": "", "pensum": "–"})
    return jobs

# ----------------------------------------------------------------------------
# 5) MAIN CRAWLER LOGIC
# ----------------------------------------------------------------------------

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(extra_http_headers=HEADERS, ignore_https_errors=True)
    page = context.new_page()

    # ----- 5a) FESTE QUELLEN --------------------------------------------------------------------
    for id_, url, sel_link, sel_loc, sel_pen in SOURCES:
        try:
            if id_ == "lungenliga":
                out[id_].extend(fetch_lungenliga())
                print(f"✓ {id_}: {len(out[id_])} Einträge")
                continue
            if id_ == "kssg":
                out[id_].extend(fetch_kssg(url))
                print(f"✓ {id_}: {len(out[id_])} Einträge")
                continue
            if id_ == "css":
                out[id_].extend(fetch_css(url))
                print(f"✓ {id_}: {len(out[id_])} Einträge")
                continue

            # Playwright‑basiertes Scraping
            page.goto(url, timeout=30000)
            page.wait_for_load_state("networkidle")
            if id_ == "usz":
                out[id_].extend(fetch_usz(page, url))
                print(f"✓ {id_}: {len(out[id_])} Einträge")
                continue

            soup = BeautifulSoup(page.content(), "lxml")
            links = soup.select(sel_link)[:3]
            for a in links:
                title = clean(a.get_text())
                href = a.get("href", "")
                if href and not href.startswith("http"):
                    href = urljoin(url, href)
                loc = clean(a.select_one(sel_loc).get_text()) if sel_loc and a.select_one(sel_loc) else ""
                pen = clean(a.select_one(sel_pen).get_text()) if sel_pen and a.select_one(sel_pen) else "–"
                out[id_].append({"title": title or "Job", "url": href, "location": loc, "pensum": pen})
            print(f"✓ {id_}: {len(out[id_])} Einträge")
        except Exception as e:
            print(f"⚠️ {id_}: {e}")

    # ----- 5b) KANTONALE GESUNDHEITSDIREKTIONEN -----------------------------------------------
    for kanton, url in KANTONE.items():
        try:
            page.goto(url, timeout=30000)
            page.wait_for_load_state("networkidle")
            # sehr generisch: alle sichtbaren Links einsammeln und die ersten 3 nehmen
            links = page.locator("a:visible").all()
            jobs = []
            for link in links:
                title = clean(link.inner_text())
                href = link.get_attribute("href")
                if not href or len(title) < 5:
                    continue
                if not href.startswith("http"):
                    href = url.rstrip("/") + "/" + href.lstrip("/")
                jobs.append({"title": title, "url": href, "location": kanton, "pensum": "–"})
                if len(jobs) == 3:
                    break
            out[kanton.lower()].extend(jobs)
            print(f"✓ {kanton}: {len(jobs)} Einträge")
        except Exception as e:
            print(f"⚠️ Fehler bei {kanton}: {e}")

    browser.close()

# ----------------------------------------------------------------------------
# 6) JSON SPEICHERN / AKTUALISIEREN
# ----------------------------------------------------------------------------
try:
    with open("jobs-data.json", "r", encoding="utf-8") as f:
        existing = json.load(f)
except FileNotFoundError:
    existing = {}

# Bestehende Daten aktualisieren/ersetzen
for key, jobs in out.items():
    existing[key] = jobs  # überschreibt jeweils komplett, um veraltete Einträge zu entfernen

with open("jobs-data.json", "w", encoding="utf-8") as f:
    json.dump(existing, f, ensure_ascii=False, indent=2)

print("✅ jobs-data.json aktualisiert –", datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
