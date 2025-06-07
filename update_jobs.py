import json, requests, re
from bs4 import BeautifulSoup
out = {}

html = requests.get("https://www.bag.admin.ch/bag/de/home/das-bag/arbeiten-im-bag/offene-stellen.html", timeout=20).text
soup = BeautifulSoup(html, "lxml")

jobs = []
for a in soup.select("a.teaser-link")[:3]:          # <—  CSS-Selector an BAG angepasst
    title = re.sub(r"\s+", " ", a.get_text(strip=True))
    url   = "https://www.bag.admin.ch" + a["href"]
    loc   = a.find_next("span").get_text(strip=True)
    jobs.append({"title": title, "url": url, "location": loc, "pensum": "–"})

out["bag"] = jobs
with open("site/jobs-data.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print("OK – jobs-data.json geschrieben")

