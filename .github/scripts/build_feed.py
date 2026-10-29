#!/usr/bin/env python3
"""Builds spectral-journal/feed.json for the Spectral Journal app.

Runs on GitHub Actions every 15 minutes (see .github/workflows/feed.yml). One file, served by
GitHub Pages, replaces the three requests the app used to make itself:
  - "steam":     the raw Steam news response for Phasmophobia (official announcements + press)
  - "community": r/PhasmophobiaGame hot posts + leak/console search, in the app's cache format
  - "meta":      hand-edited spectral-journal/meta.json (latest version, announcement banner)
Nothing about any user is involved: the script only talks to Steam and Reddit.
"""
import calendar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from html import unescape

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "spectral-journal", "feed.json")
META = os.path.join(ROOT, "spectral-journal", "meta.json")

APP_ID = 739630
STEAM = f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid={APP_ID}&count=40&maxlength=0&format=json"
SUB = "PhasmophobiaGame"
REDDIT_HOT = f"https://www.reddit.com/r/{SUB}/hot.json?limit=40&raw_json=1"
REDDIT_LEAKS = (
    f"https://www.reddit.com/r/{SUB}/search.json?q=leak%20OR%20datamine%20OR%20spoiler%20OR%20%22dev%20preview%22"
    "%20OR%20console%20OR%20playstation%20OR%20xbox&restrict_sr=1&sort=new&limit=30&raw_json=1"
)
REDDIT_RSS = f"https://www.reddit.com/r/{SUB}/hot.rss?limit=40"
REDDIT_LEAKS_RSS = (
    f"https://www.reddit.com/r/{SUB}/search.rss?q=leak%20OR%20datamine%20OR%20spoiler%20OR%20%22dev%20preview%22"
    "%20OR%20console%20OR%20playstation%20OR%20xbox&restrict_sr=1&sort=new&limit=30"
)
UA = "SpectralJournalFeed/1.0 (+https://navacrete.github.io/; unofficial Phasmophobia companion app)"
COMMUNITY_MAX_AGE = 60 * 60  # refresh Reddit at most hourly – it changes constantly and we do not want 96 commits a day


def get(url, accept="application/json", timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def steam_news():
    data = json.loads(get(STEAM))
    items = data["appnews"]["newsitems"]
    if not isinstance(items, list) or not items:
        raise ValueError("steam: empty newsitems")
    return data


def reddit_listing(url):
    data = json.loads(get(url))
    out = []
    for child in data["data"]["children"]:
        d = child.get("data") or {}
        if d.get("stickied"):
            continue
        title = (d.get("title") or "").strip()
        if not title:
            continue
        flair = d.get("link_flair_text")
        out.append({
            "gid": "r_" + str(d.get("id", "")),
            "title": title,
            "url": "https://www.reddit.com" + str(d.get("permalink", "")),
            "author": "u/" + str(d.get("author", "")),
            "contents": str(d.get("selftext") or "")[:4000],
            "date": int(d.get("created_utc") or 0),
            "flair": flair if isinstance(flair, str) else "",
            "score": int(d.get("score") or 0),
            "comments": int(d.get("num_comments") or 0),
        })
    return out


def reddit_rss(url=REDDIT_RSS):
    xml = get(url, "application/atom+xml, application/xml, text/xml")
    ns = {"a": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(xml)
    out = []
    for e in root.findall("a:entry", ns):
        title = (e.findtext("a:title", default="", namespaces=ns) or "").strip()
        if not title:
            continue
        link = e.find("a:link", ns)
        href = link.get("href") if link is not None else f"https://www.reddit.com/r/{SUB}/"
        author = (e.findtext("a:author/a:name", default="", namespaces=ns) or "").strip()
        updated = (e.findtext("a:updated", default="", namespaces=ns) or "").strip()
        content = e.findtext("a:content", default="", namespaces=ns) or ""
        content = unescape(re.sub(r"<[^>]+>", " ", content))
        eid = (e.findtext("a:id", default="", namespaces=ns) or "").strip()
        try:
            ts = calendar.timegm(time.strptime(updated[:19], "%Y-%m-%dT%H:%M:%S"))
        except ValueError:
            ts = int(time.time())
        out.append({
            "gid": "r_" + (eid.rsplit("_", 1)[-1] if eid else href),
            "title": title, "url": href, "author": author or f"r/{SUB}",
            "contents": content[:4000], "date": ts, "flair": "", "score": 0, "comments": 0,
        })
    return out


def community():
    """hot + leak search, deduplicated, newest first. Raises when everything failed."""
    try:
        hot = reddit_listing(REDDIT_HOT)
    except Exception as ex:  # noqa: BLE001 – any network/parse error → RSS
        print(f"reddit hot json failed ({ex}); trying rss", file=sys.stderr)
        hot = reddit_rss()
    try:
        leaks = reddit_listing(REDDIT_LEAKS)
    except Exception as ex:  # noqa: BLE001
        print(f"reddit leaks json failed ({ex}); trying rss", file=sys.stderr)
        try:
            leaks = reddit_rss(REDDIT_LEAKS_RSS)
        except Exception as ex2:  # noqa: BLE001
            print(f"reddit leaks rss failed ({ex2})", file=sys.stderr)
            leaks = []
    seen, out = set(), []
    for it in hot + leaks:
        if it["gid"] in seen:
            continue
        seen.add(it["gid"])
        out.append(it)
    out.sort(key=lambda x: x["date"], reverse=True)
    if not out:
        raise ValueError("reddit: nothing parsed")
    return out


def main():
    now = int(time.time())
    previous = load_json(OUT, {})
    feed = {"generatedAt": now, "steam": None, "community": None, "communityAt": 0, "meta": load_json(META, {}), "status": {}}
    status = feed["status"]

    # Official + press (required)
    try:
        feed["steam"] = steam_news()
    except Exception as ex:  # noqa: BLE001
        print(f"steam failed: {ex}", file=sys.stderr)
        status["steamError"] = str(ex)[:200]
        feed["steam"] = previous.get("steam")
        if not feed["steam"]:
            sys.exit(1)

    # Community (best effort, hourly)
    prev_at = int(previous.get("communityAt") or 0)
    if now - prev_at >= COMMUNITY_MAX_AGE or not previous.get("community"):
        try:
            feed["community"] = community()
            feed["communityAt"] = now
        except Exception as ex:  # noqa: BLE001
            print(f"community failed: {ex}", file=sys.stderr)
            status["communityError"] = str(ex)[:200]
            feed["community"] = previous.get("community")
            feed["communityAt"] = prev_at
    else:
        feed["community"] = previous.get("community")
        feed["communityAt"] = prev_at

    # Write only when something other than the timestamp changed.
    def core(f):
        return {k: v for k, v in f.items() if k not in ("generatedAt", "status")}

    if core(previous) == core(feed):
        print("feed unchanged")
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(feed, f, ensure_ascii=False, separators=(",", ":"))
    n_steam = len(feed["steam"]["appnews"]["newsitems"])
    n_comm = len(feed["community"] or [])
    print(f"feed written: {n_steam} steam items, {n_comm} community items")


if __name__ == "__main__":
    main()
