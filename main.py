from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import httpx
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from youtube_search import YoutubeSearch
from pytubefix import YouTube
import re

app = FastAPI()

# Cache storage
cache = {
    "dd_version": None,
    "dd_champions": None,
    "dd_cache_time": None,
    "video_cache": {},
    "live_game_cache": {}
}

# Constants
DD_CACHE_HOURS = 24
VIDEO_CACHE_HOURS = 6
LIVE_GAME_CACHE_MINUTES = 1

async def get_dd_version():
    if cache["dd_version"] and cache["dd_cache_time"] and \
       datetime.now() - cache["dd_cache_time"] < timedelta(hours=DD_CACHE_HOURS):
        return cache["dd_version"]
    
    async with httpx.AsyncClient() as client:
        response = await client.get("https://ddragon.leagueoflegends.com/api/versions.json")
        versions = response.json()
        cache["dd_version"] = versions[0]
        cache["dd_cache_time"] = datetime.now()
        return cache["dd_version"]

async def get_dd_champions():
    if cache["dd_champions"] and cache["dd_cache_time"] and \
       datetime.now() - cache["dd_cache_time"] < timedelta(hours=DD_CACHE_HOURS):
        return cache["dd_champions"]
    
    version = await get_dd_version()
    async with httpx.AsyncClient() as client:
        response = await client.get(f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json")
        data = response.json()
        cache["dd_champions"] = data["data"]
        return cache["dd_champions"]

def get_champion_by_id(champion_id: int, champions_data: dict) -> Optional[dict]:
    for champ_key, champ_data in champions_data.items():
        if int(champ_data["key"]) == champion_id:
            return {
                "id": champion_id,
                "name": champ_data["name"],
                "key": champ_key
            }
    return None

@app.get("/live", response_class=HTMLResponse)
async def serve_live_page():
    with open("static/index.html", "r") as f:
        return HTMLResponse(f.read())

@app.get("/api/live")
async def get_live_game(account: str = Query(...)):
    cache_key = f"live_{account}"
    if cache_key in cache["live_game_cache"]:
        cached_data, cache_time = cache["live_game_cache"][cache_key]
        if datetime.now() - cache_time < timedelta(minutes=LIVE_GAME_CACHE_MINUTES):
            return cached_data
    
    # Parse Riot ID (gameName#tagLine)
    if "#" in account:
        game_name, tag_line = account.split("#", 1)
    else:
        raise HTTPException(status_code=400, detail="Account must be in format GameName#TAG")
    
    # Use u.gg GraphQL API
    headers = {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/json',
        'origin': 'https://u.gg',
        'referer': f'https://u.gg/lol/profile/euw1/{game_name}-{tag_line.lower()}/live-game',
        'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'x-app-type': 'web'
    }
    
    query = """
    query GetLiveGame($regionId: String!, $riotUserName: String!, $riotTagLine: String!) {
      getLiveGame(regionId: $regionId, riotUserName: $riotUserName, riotTagLine: $riotTagLine) {
        gameLengthSeconds
        gameType
        queueId
        teamA {
          championId
          riotUserName
          riotTagLine
          currentRole
        }
        teamB {
          championId
          riotUserName
          riotTagLine
          currentRole
        }
      }
    }
    """
    
    payload = {
        "operationName": "GetLiveGame",
        "variables": {
            "riotUserName": game_name,
            "riotTagLine": tag_line,
            "regionId": "euw1"
        },
        "query": query
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post('https://u.gg/api', headers=headers, json=payload, timeout=10)
            response.raise_for_status()
            ugg_data = response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                retry_after = e.response.headers.get("Retry-After", "60")
                raise HTTPException(status_code=429, detail=f"Rate limited. Retry after {retry_after} seconds")
            raise HTTPException(status_code=e.response.status_code, detail="u.gg API error")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch live game: {str(e)}")
    
    # Check if live game exists
    if not ugg_data.get('data') or not ugg_data['data'].get('getLiveGame'):
        if ugg_data.get('errors'):
            error_detail = ugg_data['errors'][0].get('message', 'Unknown error')
            raise HTTPException(status_code=404, detail=f"Not currently in game: {error_detail}")
        raise HTTPException(status_code=404, detail="Not currently in game")
    
    live_game = ugg_data['data']['getLiveGame']
    
    # Get champion data for name mapping
    champions_data = await get_dd_champions()
    
    # Find which team the account belongs to and build teams
    account_lower = f"{game_name}#{tag_line}".lower()
    my_champion = None
    ally_team = []
    enemy_team = []
    
    # Check team A
    for player in live_game.get('teamA', []):
        player_name = f"{player['riotUserName']}#{player['riotTagLine']}".lower()
        if player_name == account_lower:
            my_champion = get_champion_by_id(player['championId'], champions_data)
            # This player's team is allies, team A = allies, team B = enemies
            def sort_by_role(team_data):
                role_order = {"top": 1, "jungle": 2, "mid": 3, "adc": 4, "supp": 5}
                return sorted(team_data, key=lambda x: role_order.get(x.get("currentRole", "supp"), 5))
            
            ally_team = []
            for p in live_game['teamA']:
                champ_data = get_champion_by_id(p['championId'], champions_data)
                ally_team.append({
                    "summonerName": f"{p['riotUserName']}#{p['riotTagLine']}",
                    "championId": p['championId'],
                    "championName": champ_data["name"] if champ_data else "Unknown",
                    "championKey": champ_data["key"] if champ_data else None,
                    "currentRole": p.get('currentRole', 'supp')
                })
            ally_team = sort_by_role(ally_team)
            
            enemy_team = []
            for p in live_game['teamB']:
                champ_data = get_champion_by_id(p['championId'], champions_data)
                enemy_team.append({
                    "summonerName": f"{p['riotUserName']}#{p['riotTagLine']}",
                    "championId": p['championId'],
                    "championName": champ_data["name"] if champ_data else "Unknown",
                    "championKey": champ_data["key"] if champ_data else None,
                    "currentRole": p.get('currentRole', 'supp')
                })
            enemy_team = sort_by_role(enemy_team)
            break
    
    # Check team B if not found in team A
    if not my_champion:
        for player in live_game.get('teamB', []):
            player_name = f"{player['riotUserName']}#{player['riotTagLine']}".lower()
            if player_name == account_lower:
                my_champion = get_champion_by_id(player['championId'], champions_data)
                # This player's team is allies, team B = allies, team A = enemies
                def sort_by_role(team_data):
                    role_order = {"top": 1, "jungle": 2, "mid": 3, "adc": 4, "supp": 5}
                    return sorted(team_data, key=lambda x: role_order.get(x.get("currentRole", "supp"), 5))
                
                ally_team = []
                for p in live_game['teamB']:
                    champ_data = get_champion_by_id(p['championId'], champions_data)
                    ally_team.append({
                        "summonerName": f"{p['riotUserName']}#{p['riotTagLine']}",
                        "championId": p['championId'],
                        "championName": champ_data["name"] if champ_data else "Unknown",
                        "championKey": champ_data["key"] if champ_data else None,
                        "currentRole": p.get('currentRole', 'supp')
                    })
                ally_team = sort_by_role(ally_team)
                
                enemy_team = []
                for p in live_game['teamA']:
                    champ_data = get_champion_by_id(p['championId'], champions_data)
                    enemy_team.append({
                        "summonerName": f"{p['riotUserName']}#{p['riotTagLine']}",
                        "championId": p['championId'],
                        "championName": champ_data["name"] if champ_data else "Unknown",
                        "championKey": champ_data["key"] if champ_data else None,
                        "currentRole": p.get('currentRole', 'supp')
                    })
                enemy_team = sort_by_role(enemy_team)
                break
    
    if not my_champion:
        raise HTTPException(status_code=404, detail="Account not found in current game")
    
    # Get DD version for image URLs
    dd_version = await get_dd_version()
    
    result = {
        "gameId": f"ugg_{live_game.get('queueId', 0)}",
        "gameMode": live_game.get('gameType', 'unknown'),
        "gameStartTime": int(datetime.now().timestamp() * 1000) - (live_game.get('gameLengthSeconds', 0) * 1000),
        "myChampion": my_champion,
        "allyTeam": ally_team,
        "enemyTeam": enemy_team,
        "ddVersion": dd_version
    }
    
    cache["live_game_cache"][cache_key] = (result, datetime.now())
    return result

@app.get("/api/videos")
async def get_videos(selectedChampion: str = Query(...), myChampion: str = Query(...)):
    # Guide video is about the selected champion
    guide_query = f"3 Minute League of Legends {selectedChampion} Guide"
    
    # Check cache for guide
    if guide_query in cache["video_cache"]:
        cached_guide, cache_time = cache["video_cache"][guide_query]
        if datetime.now() - cache_time < timedelta(hours=VIDEO_CACHE_HOURS):
            guide_result = cached_guide
        else:
            guide_result = search_video(guide_query)
            cache["video_cache"][guide_query] = (guide_result, datetime.now())
    else:
        guide_result = search_video(guide_query)
        cache["video_cache"][guide_query] = (guide_result, datetime.now())
    
    # Build matchup query: myChampion vs selectedChampion
    matchup_result = None
    fallback_reason = None
    
    creator = None
    if myChampion.lower() == "aatrox":
        creator = "Naayil"
    elif myChampion.lower() == "tryndamere":
        creator = "Foggedftw2"
    
    # Try with creator first if available
    if creator:
        matchup_query = f"{creator} {myChampion} vs {selectedChampion}"
        matchup_result = search_video(matchup_query)
        if not matchup_result:
            fallback_reason = f"No results for {creator} matchup"
    
    # Fallback to generic matchup
    if not matchup_result:
        matchup_query = f"{myChampion} vs {selectedChampion} matchup"
        matchup_result = search_video(matchup_query)
        if not matchup_result:
            fallback_reason = "No specific matchup videos found"
    
    # Final fallback to generic guide
    if not matchup_result:
        matchup_query = f"{myChampion} guide"
        matchup_result = search_video(matchup_query)
        if not matchup_result:
            fallback_reason = "No matchup or guide videos found"
    
    return {
        "guide": guide_result,
        "matchup": matchup_result,
        "fallbackReason": fallback_reason if not matchup_result else None
    }

def parse_abilities_timestamp(description: str) -> Optional[int]:
    """Parse YouTube description to find abilities chapter timestamp in seconds"""
    try:
        # Look for patterns like "0:16 Briar's Abilities" or "1:23 Abilities"
        lines = description.split('\n')
        for i, line in enumerate(lines):
            # Skip the first line (usually title/intro) and look for abilities
            if i == 0:
                continue
            
            # Match timestamp patterns like "0:16", "1:23", etc.
            timestamp_match = re.search(r'(\d+):(\d+)', line)
            if timestamp_match and ('abilit' in line.lower() or 'spell' in line.lower()):
                minutes = int(timestamp_match.group(1))
                seconds = int(timestamp_match.group(2))
                return minutes * 60 + seconds
        
        # Fallback: look for the second timestamp (often abilities)
        timestamps = []
        for line in lines:
            timestamp_match = re.search(r'(\d+):(\d+)', line)
            if timestamp_match:
                minutes = int(timestamp_match.group(1))
                seconds = int(timestamp_match.group(2))
                timestamps.append(minutes * 60 + seconds)
        
        # Return second timestamp if available
        if len(timestamps) >= 2:
            return timestamps[1]
            
    except Exception:
        pass
    return None

def get_video_description(video_id: str) -> str:
    """Get YouTube video description using pytube"""
    try:
        yt = YouTube(f"https://www.youtube.com/watch?v={video_id}")
        return yt.description or ""
    except Exception:
        return ""

def search_video(query: str) -> Optional[Dict[str, Any]]:
    try:
        results = YoutubeSearch(query, max_results=1).to_dict()
        if results:
            video = results[0]
            video_id = video["id"]
            
            # Get description and parse abilities timestamp for guide videos
            abilities_start = None
            if "3 minute" in query.lower() and "guide" in query.lower():
                description = get_video_description(video_id)
                abilities_start = parse_abilities_timestamp(description)
            
            return {
                "videoId": video_id,
                "title": video["title"],
                "channel": video["channel"],
                "abilitiesStart": abilities_start
            }
    except Exception:
        pass
    return None

@app.get("/api/cooldowns")
async def get_cooldowns(champion: str = Query(...)):
    version = await get_dd_version()
    champions_data = await get_dd_champions()
    
    # Find the champion ID (key) from the name
    champion_id = None
    for champ_key, champ_data in champions_data.items():
        if champ_data["name"].lower() == champion.lower():
            champion_id = champ_key
            break
    
    if not champion_id:
        raise HTTPException(status_code=404, detail="Champion not found")
    
    async with httpx.AsyncClient() as client:
        try:
            # Use BigBrain API for cleaner descriptions without mustache templates
            response = await client.get(f"https://static.bigbrain.gg/assets/lol/riot_static/{version}/data/en_US/champion/{champion_id}.json")
            response.raise_for_status()
            champ_data = response.json()["data"][champion_id]
            
            spells = []
            spell_keys = ["Q", "W", "E", "R"]
            
            for i, spell_key in enumerate(spell_keys):
                spell = champ_data["spells"][i]
                spells.append({
                    "key": spell_key,
                    "name": spell["name"],
                    "cooldowns": spell["cooldown"],
                    "description": spell["description"],  # Use clean description instead of tooltip
                    "iconUrl": f"https://ddragon.leagueoflegends.com/cdn/{version}/img/spell/{spell['image']['full']}"
                })
            
            return spells
        except httpx.HTTPStatusError:
            # Fallback to Data Dragon if BigBrain API fails
            try:
                response = await client.get(f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion/{champion_id}.json")
                response.raise_for_status()
                champ_data = response.json()["data"][champion_id]
                
                spells = []
                spell_keys = ["Q", "W", "E", "R"]
                
                for i, spell_key in enumerate(spell_keys):
                    spell = champ_data["spells"][i]
                    spells.append({
                        "key": spell_key,
                        "name": spell["name"],
                        "cooldowns": spell["cooldown"],
                        "description": spell["tooltip"],  # Fallback to tooltip
                        "iconUrl": f"https://ddragon.leagueoflegends.com/cdn/{version}/img/spell/{spell['image']['full']}"
                    })
                
                return spells
            except httpx.HTTPStatusError:
                raise HTTPException(status_code=404, detail="Champion not found")

# Serve static files
app.mount("/live/assets", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
