# Live LoL Helper

A single-page application that helps with live League of Legends games by providing champion guides, matchup videos, and enemy ability cooldowns.

## Features

- **Live Game Integration**: Fetches current live game data from Riot API (EUW1 region)
- **Champion Guides**: Automatically finds 3-minute champion guides on YouTube
- **Matchup Videos**: Shows specific matchup videos with preferred creators for Aatrox (Naayil) and Tryndamere (Foggedftw2)
- **Ability Cooldowns**: Displays enemy champion abilities with base cooldown values from Data Dragon
- **Account Management**: Cookie-based account storage for quick access

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set your Riot API key as an environment variable:
```bash
export RIOT_API_KEY="your_riot_api_key_here"
```

3. Run the application:
```bash
python main.py
```

4. Open your browser to `http://localhost:8000/live`

## Usage

1. **Add Account**: Click "Add" to add your EUW1 summoner name
2. **Select Account**: Use the dropdown to select which account to track
3. **Refresh**: Click "Refresh" to fetch the current live game
4. **Champion Selection**: 
   - Click allies (blue border) to view their champion info
   - Click enemies (red border) to see their abilities and update matchup videos
5. **Videos**: Two YouTube videos will load automatically:
   - Left: 3-minute guide for your champion
   - Right: Matchup video based on your champion vs selected enemy

## API Endpoints

- `GET /live` - Serves the main application
- `GET /api/live?account={name}` - Fetches live game data for an account
- `GET /api/videos?myChampion={name}&enemyChampion={name}` - Gets YouTube video recommendations
- `GET /api/cooldowns?champion={name}` - Returns champion ability cooldowns from Data Dragon

## Requirements

- Python 3.8+
- Riot API key (get from https://developer.riotgames.com/)
- Desktop browser (minimum width 1280px)
- Internet connection for Riot API, Data Dragon, and YouTube

## Notes

- Only supports EUW1 region
- Uses base cooldown values (no ability haste or items considered)
- Videos are cached for 6 hours, Data Dragon data for 24 hours
- Live game data is cached for 1 minute to respect rate limits