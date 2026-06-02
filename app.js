"use strict";

/* =========================================================================
 * Gamesite — Flash games via Ruffle + the Internet Archive.
 *
 * Storage model (works on ANY device/OS/browser, no custom paths):
 *   - Favorites & history  -> browser localStorage (keys below)
 *   - Game progress         -> Flash SharedObjects, which Ruffle persists into
 *                              localStorage automatically, keyed by the .swf URL.
 *   - Export/Import         -> dumps/restores the whole localStorage as JSON so
 *                              you can carry saves between devices (e.g. Chromebook).
 * ========================================================================= */

const COLLECTION = "softwarelibrary_flash";
const ROWS_PER_PAGE = 24;
const LS_FAVORITES = "gamesite.favorites";
const LS_HISTORY = "gamesite.history";
const LS_ROMSAVE = "gamesite.romsave."; // + identifier -> base64 EmulatorJS save state
const LS_FLASHSAVE = "gamesite.flashsave."; // + identifier -> JSON of the game's Ruffle SharedObject keys
const LS_USERROMS = "gamesite.userroms"; // user-added retro games [{identifier,title,system,core,rom}]
const LS_USERWEB = "gamesite.userweb";   // user-added web games  [{identifier,title,url,img}]
const WEB_GAMES_URL = "web-games.json";  // self-hosted HTML5 games catalog (built by tools/build-games.py from games/)
const ROMS_URL = "roms.json";            // self-hosted ROM catalog (built by tools/build-roms.py from roms/)
const LS_UPDATE_SEEN = "gamesite.update.seen";
const UPDATE_ID = "2026-06-tabs-web"; // bump this to show a fresh "What's new" once per device
const HISTORY_LIMIT = 12;

/* ---------- Retro console games (emulated with EmulatorJS) ----------
 * Each entry plays through emulator.html instead of Ruffle. ROMs must be at a
 * CORS-open URL. Seeded with free homebrew (legal to host). To add more, append
 * { identifier, title, system, core, rom } — e.g. a ROM file from the Internet
 * Archive via  https://archive.org/cors/<identifier>/<file>  (that path sends
 * Access-Control-Allow-Origin: *). Cores: nes, snes, segaMD, segaGG,
 * gb, gba, n64, psx … (see emulatorjs.org/docs/options).
 */
const CONSOLE_GAMES = [
  { identifier: "rb-nes-31in1realgame-multicart", title: "31in1realgame Multicart", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/31in1realgame-multicart.nes" },
  { identifier: "rb-nes-3in12ppak", title: "3in12ppak", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/3in12ppak.nes" },
  { identifier: "rb-nes-ambushed", title: "Ambushed", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/ambushed.nes" },
  { identifier: "rb-nes-assimilate", title: "Assimilate", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/assimilate.nes" },
  { identifier: "rb-nes-babelblox", title: "Babelblox", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/babelblox.nes" },
  { identifier: "rb-nes-blackboxchallenge", title: "Blackboxchallenge", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/blackboxchallenge.nes" },
  { identifier: "rb-nes-blaster", title: "Blaster", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/blaster.nes" },
  { identifier: "rb-nes-bombarray", title: "Bombarray", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/bombarray.nes" },
  { identifier: "rb-nes-bootee", title: "Bootee", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/bootee.nes" },
  { identifier: "rb-nes-bronyblaster", title: "Bronyblaster", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/bronyblaster.nes" },
  { identifier: "rb-nes-cheril-the-goddess", title: "Cheril The Goddess", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/cheril-the-goddess.nes" },
  { identifier: "rb-nes-cl1k", title: "Cl1k", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/cl1k.nes" },
  { identifier: "rb-nes-croom", title: "Croom", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/croom.nes" },
  { identifier: "rb-nes-dabg", title: "Dabg", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/dabg.nes" },
  { identifier: "rb-nes-debrisdodger", title: "Debrisdodger", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/debrisdodger.nes" },
  { identifier: "rb-nes-driar", title: "Driar", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/driar.nes" },
  { identifier: "rb-nes-falling", title: "Falling", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/falling.nes" },
  { identifier: "rb-nes-fff", title: "Fff", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/fff.nes" },
  { identifier: "rb-nes-filthykitchen", title: "Filthykitchen", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/filthykitchen.nes" },
  { identifier: "rb-nes-flappybird", title: "Flappybird", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/flappybird.nes" },
  { identifier: "rb-nes-flappyblock", title: "Flappyblock", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/flappyblock.nes" },
  { identifier: "rb-nes-flappyjack", title: "Flappyjack", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/flappyjack.nes" },
  { identifier: "rb-nes-forpoints", title: "Forpoints", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/forpoints.nes" },
  { identifier: "rb-nes-gsm", title: "Gsm", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/gsm.nes" },
  { identifier: "rb-nes-indivisibleonnes", title: "Indivisibleonnes", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/indivisibleonnes.nes" },
  { identifier: "rb-nes-invaders", title: "Invaders", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/invaders.nes" },
  { identifier: "rb-nes-jetpaco", title: "Jetpaco", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/jetpaco.nes" },
  { identifier: "rb-nes-kyff", title: "Kyff", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/kyff.nes" },
  { identifier: "rb-nes-lala", title: "Lala", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/lala.nes" },
  { identifier: "rb-nes-lightshields", title: "Lightshields", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/lightshields.nes" },
  { identifier: "rb-nes-lunarlimit", title: "Lunarlimit", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/lunarlimit.nes" },
  { identifier: "rb-nes-madwizard", title: "Madwizard", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/madwizard.nes" },
  { identifier: "rb-nes-mashymashy", title: "Mashymashy", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/mashymashy.nes" },
  { identifier: "rb-nes-megamountain", title: "Megamountain", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/megamountain.nes" },
  { identifier: "rb-nes-memory", title: "Memory", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/memory.nes" },
  { identifier: "rb-nes-mguard", title: "Mguard", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/mguard.nes" },
  { identifier: "rb-nes-mguard2", title: "Mguard2", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/mguard2.nes" },
  { identifier: "rb-nes-midnightjogger", title: "Midnightjogger", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/midnightjogger.nes" },
  { identifier: "rb-nes-miedow", title: "Miedow", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/miedow.nes" },
  { identifier: "rb-nes-mineshaft", title: "Mineshaft", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/mineshaft.nes" },
  { identifier: "rb-nes-mouser2", title: "Mouser2", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/mouser2.nes" },
  { identifier: "rb-nes-nesertbus", title: "Nesertbus", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/nesertbus.nes" },
  { identifier: "rb-nes-ninjamuncher", title: "Ninjamuncher", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/ninjamuncher.nes" },
  { identifier: "rb-nes-nintencattheparody", title: "Nintencattheparody", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/nintencattheparody.nes" },
  { identifier: "rb-nes-nomolos", title: "Nomolos", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/nomolos.nes" },
  { identifier: "rb-nes-nopoints", title: "Nopoints", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/nopoints.nes" },
  { identifier: "rb-nes-novathesquirrel", title: "Novathesquirrel", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/novathesquirrel.nes" },
  { identifier: "rb-nes-obstacletrek", title: "Obstacletrek", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/obstacletrek.nes" },
  { identifier: "rb-nes-owlia", title: "Owlia", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/owlia.nes" },
  { identifier: "rb-nes-pegs", title: "Pegs", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/pegs.nes" },
  { identifier: "rb-nes-pong1k", title: "Pong1k", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/pong1k.nes" },
  { identifier: "rb-nes-pong1k2p", title: "Pong1k2p", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/pong1k2p.nes" },
  { identifier: "rb-nes-ralph4", title: "Ralph4", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/ralph4.nes" },
  { identifier: "rb-nes-rhde", title: "Rhde", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/rhde.nes" },
  { identifier: "rb-nes-riseofamondus", title: "Riseofamondus", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/riseofamondus.nes" },
  { identifier: "rb-nes-roboninjaclimb", title: "Roboninjaclimb", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/roboninjaclimb.nes" },
  { identifier: "rb-nes-robotfindskitten", title: "Robotfindskitten", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/robotfindskitten.nes" },
  { identifier: "rb-nes-roulette", title: "Roulette", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/roulette.nes" },
  { identifier: "rb-nes-rpsls", title: "Rpsls", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/rpsls.nes" },
  { identifier: "rb-nes-sgthelmet", title: "Sgthelmet", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/sgthelmet.nes" },
  { identifier: "rb-nes-simonesays", title: "Simonesays", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/simonesays.nes" },
  { identifier: "rb-nes-sir-ababol-remastered", title: "Sir Ababol Remastered", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/sir-ababol-remastered.nes" },
  { identifier: "rb-nes-snailmaze", title: "Snailmaze", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/snailmaze.nes" },
  { identifier: "rb-nes-spaceymcracey", title: "Spaceymcracey", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/spaceymcracey.nes" },
  { identifier: "rb-nes-starevil", title: "Starevil", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/starevil.nes" },
  { identifier: "rb-nes-super-tilt-bro", title: "Super Tilt Bro", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/super-tilt-bro.nes" },
  { identifier: "rb-nes-superpakpak", title: "Superpakpak", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/superpakpak.nes" },
  { identifier: "rb-nes-superuwol", title: "Superuwol", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/superuwol.nes" },
  { identifier: "rb-nes-thatswhack", title: "Thatswhack", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/thatswhack.nes" },
  { identifier: "rb-nes-theinvasion", title: "Theinvasion", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/theinvasion.nes" },
  { identifier: "rb-nes-themadwizard", title: "Themadwizard", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/themadwizard.nes" },
  { identifier: "rb-nes-theonewiththewalls", title: "Theonewiththewalls", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/theonewiththewalls.nes" },
  { identifier: "rb-nes-thewit", title: "Thewit", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/thewit.nes" },
  { identifier: "rb-nes-thwaite", title: "Thwaite", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/thwaite.nes" },
  { identifier: "rb-nes-tictactwop", title: "Tictactwop", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/tictactwop.nes" },
  { identifier: "rb-nes-tictacxo", title: "Tictacxo", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/tictacxo.nes" },
  { identifier: "rb-nes-tigerjenny", title: "Tigerjenny", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/tigerjenny.nes" },
  { identifier: "rb-nes-twindragons", title: "Twindragons", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/twindragons.nes" },
  { identifier: "rb-nes-vigilanteninja", title: "Vigilanteninja", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/vigilanteninja.nes" },
  { identifier: "rb-nes-viruscleaner", title: "Viruscleaner", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/viruscleaner.nes" },
  { identifier: "rb-nes-wo-xiang-niao-niao", title: "Wo Xiang Niao Niao", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/wo-xiang-niao-niao.nes" },
  { identifier: "rb-nes-yun", title: "Yun", system: "NES", core: "nes",
    rom: "https://raw.githubusercontent.com/retrobrews/nes-games/master/yun.nes" },
  { identifier: "rb-snes-astrohawk", title: "Astrohawk", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/astrohawk.smc" },
  { identifier: "rb-snes-blt", title: "Blt", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/blt.sfc" },
  { identifier: "rb-snes-bucket", title: "Bucket", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/bucket.smc" },
  { identifier: "rb-snes-furryrpg", title: "Furryrpg", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/furryrpg.sfc" },
  { identifier: "rb-snes-hilda", title: "Hilda", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/hilda.sfc" },
  { identifier: "rb-snes-horizontal-shooter", title: "Horizontal Shooter", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/horizontal-shooter.sfc" },
  { identifier: "rb-snes-jetpilotrising", title: "Jetpilotrising", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/jetpilotrising.sfc" },
  { identifier: "rb-snes-megafamilybros", title: "Megafamilybros", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/megafamilybros.smc" },
  { identifier: "rb-snes-nwarpdaisakusen", title: "Nwarpdaisakusen", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/nwarpdaisakusen.smc" },
  { identifier: "rb-snes-questformoney", title: "Questformoney", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/questformoney.sfc" },
  { identifier: "rb-snes-rockfall", title: "Rockfall", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/rockfall.smc" },
  { identifier: "rb-snes-saf", title: "Saf", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/saf.smc" },
  { identifier: "rb-snes-superbossgaiden", title: "Superbossgaiden", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/superbossgaiden.sfc" },
  { identifier: "rb-snes-tchouv2", title: "Tchouv2", system: "SNES", core: "snes",
    rom: "https://raw.githubusercontent.com/retrobrews/snes-games/master/tchouv2.smc" },
  { identifier: "rb-md-30yearsofnintendont", title: "30yearsofnintendont", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/30yearsofnintendont.bin" },
  { identifier: "rb-md-readme", title: "README", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/README.md" },
  { identifier: "rb-md-asciiwar", title: "Asciiwar", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/asciiwar.bin" },
  { identifier: "rb-md-astroperdido", title: "Astroperdido", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/astroperdido.bin" },
  { identifier: "rb-md-barbarian", title: "Barbarian", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/barbarian.bin" },
  { identifier: "rb-md-bareknuckleprincesss", title: "Bareknuckleprincesss", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/bareknuckleprincesss.bin" },
  { identifier: "rb-md-bombonbasiccity", title: "Bombonbasiccity", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/bombonbasiccity.bin" },
  { identifier: "rb-md-bombx", title: "Bombx", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/bombx.bin" },
  { identifier: "rb-md-bottled", title: "Bottled", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/bottled.md" },
  { identifier: "rb-md-breakanegg", title: "Breakanegg", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/breakanegg.bin" },
  { identifier: "rb-md-cavestory", title: "Cavestory", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/cavestory.bin" },
  { identifier: "rb-md-crazycars", title: "Crazycars", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/crazycars.bin" },
  { identifier: "rb-md-crazydriver", title: "Crazydriver", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/crazydriver.bin" },
  { identifier: "rb-md-downforce", title: "Downforce", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/downforce.bin" },
  { identifier: "rb-md-dragonscastle", title: "Dragonscastle", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/dragonscastle.bin" },
  { identifier: "rb-md-errorrush", title: "Errorrush", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/errorrush.bin" },
  { identifier: "rb-md-fixitfelixjr", title: "Fixitfelixjr", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/fixitfelixjr.bin" },
  { identifier: "rb-md-genpoker", title: "Genpoker", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/genpoker.bin" },
  { identifier: "rb-md-glassbreakermd", title: "Glassbreakermd", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/glassbreakermd.bin" },
  { identifier: "rb-md-goldrush", title: "Goldrush", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/goldrush.bin" },
  { identifier: "rb-md-goplanes", title: "Goplanes", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/goplanes.bin" },
  { identifier: "rb-md-gravitypig", title: "Gravitypig", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/gravitypig.bin" },
  { identifier: "rb-md-grielsquest", title: "Grielsquest", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/grielsquest.bin" },
  { identifier: "rb-md-headship", title: "Headship", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/headship.bin" },
  { identifier: "rb-md-ikplusdeluxe", title: "Ikplusdeluxe", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/ikplusdeluxe.bin" },
  { identifier: "rb-md-junkbots", title: "Junkbots", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/junkbots.bin" },
  { identifier: "rb-md-leomurconspiracy", title: "Leomurconspiracy", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/leomurconspiracy.bin" },
  { identifier: "rb-md-mega-cheril-perils", title: "Mega Cheril Perils", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/mega-cheril-perils.bin" },
  { identifier: "rb-md-megaflappysis", title: "Megaflappysis", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/megaflappysis.bin" },
  { identifier: "rb-md-megamindtris", title: "Megamindtris", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/megamindtris.bin" },
  { identifier: "rb-md-miniplanets", title: "Miniplanets", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/miniplanets.bin" },
  { identifier: "rb-md-msa", title: "Msa", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/msa.bin" },
  { identifier: "rb-md-odeiocarros", title: "Odeiocarros", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/odeiocarros.bin" },
  { identifier: "rb-md-ohmummy", title: "Ohmummy", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/ohmummy.bin" },
  { identifier: "rb-md-oldtowers", title: "Oldtowers", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/oldtowers.bin" },
  { identifier: "rb-md-papicommandoremix", title: "Papicommandoremix", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/papicommandoremix.bin" },
  { identifier: "rb-md-papicommandotennis", title: "Papicommandotennis", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/papicommandotennis.bin" },
  { identifier: "rb-md-pingouinbleu", title: "Pingouinbleu", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/pingouinbleu.bin" },
  { identifier: "rb-md-pingouinrose", title: "Pingouinrose", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/pingouinrose.bin" },
  { identifier: "rb-md-plataforma-ultimate", title: "Plataforma Ultimate", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/plataforma-ultimate.bin" },
  { identifier: "rb-md-pongram", title: "Pongram", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/pongram.bin" },
  { identifier: "rb-md-projectmd", title: "Projectmd", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/projectmd.bin" },
  { identifier: "rb-md-racer", title: "Racer", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/racer.bin" },
  { identifier: "rb-md-radrhino", title: "Radrhino", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/radrhino.bin" },
  { identifier: "rb-md-redqueenrampage", title: "Redqueenrampage", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/redqueenrampage.bin" },
  { identifier: "rb-md-returntogenesis", title: "Returntogenesis", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/returntogenesis.bin" },
  { identifier: "rb-md-rickdangerous", title: "Rickdangerous", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/rickdangerous.bin" },
  { identifier: "rb-md-rickdangerous2", title: "Rickdangerous2", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/rickdangerous2.bin" },
  { identifier: "rb-md-scorpionilluminati", title: "Scorpionilluminati", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/scorpionilluminati.bin" },
  { identifier: "rb-md-shatteringjaws", title: "Shatteringjaws", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/shatteringjaws.md" },
  { identifier: "rb-md-starchaser", title: "Starchaser", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/starchaser.bin" },
  { identifier: "rb-md-tronow", title: "Tronow", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/tronow.bin" },
  { identifier: "rb-md-twocyclops-fight", title: "Twocyclops Fight", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/twocyclops-fight.bin" },
  { identifier: "rb-md-twocyclops", title: "Twocyclops", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/twocyclops.bin" },
  { identifier: "rb-md-ultimatetetris", title: "Ultimatetetris", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/ultimatetetris.bin" },
  { identifier: "rb-md-vilq", title: "Vilq", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/vilq.bin" },
  { identifier: "rb-md-vilqadventure", title: "Vilqadventure", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/vilqadventure.bin" },
  { identifier: "rb-md-violencepingouin", title: "Violencepingouin", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/violencepingouin.bin" },
  { identifier: "rb-md-virtuaworm", title: "Virtuaworm", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/virtuaworm.bin" },
  { identifier: "rb-md-virtuaworm2", title: "Virtuaworm2", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/virtuaworm2.bin" },
  { identifier: "rb-md-wackywilly", title: "Wackywilly", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/wackywilly.bin" },
  { identifier: "rb-md-xump2", title: "Xump2", system: "Genesis", core: "segaMD",
    rom: "https://raw.githubusercontent.com/retrobrews/md-games/master/xump2.bin" },
  { identifier: "rb-gba-3weeksinparadise", title: "3weeksinparadise", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/3weeksinparadise.gba" },
  { identifier: "rb-gba-airball", title: "Airball", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/airball.gba" },
  { identifier: "rb-gba-anguna", title: "Anguna", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/anguna.gba" },
  { identifier: "rb-gba-anotherworld", title: "Anotherworld", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/anotherworld.gba" },
  { identifier: "rb-gba-asteroidsb", title: "Asteroidsb", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/asteroidsb.gba" },
  { identifier: "rb-gba-awerewolftale", title: "Awerewolftale", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/awerewolftale.gba" },
  { identifier: "rb-gba-balle", title: "Balle", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/balle.gba" },
  { identifier: "rb-gba-battlepicross", title: "Battlepicross", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/battlepicross.gba" },
  { identifier: "rb-gba-blastarenaadvance", title: "Blastarenaadvance", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/blastarenaadvance.gba" },
  { identifier: "rb-gba-blocktrap", title: "Blocktrap", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/blocktrap.gba" },
  { identifier: "rb-gba-bridgeracer", title: "Bridgeracer", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/bridgeracer.gba" },
  { identifier: "rb-gba-bunnyxmas", title: "Bunnyxmas", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/bunnyxmas.gba" },
  { identifier: "rb-gba-bytes", title: "Bytes", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/bytes.gba" },
  { identifier: "rb-gba-castlemaster", title: "Castlemaster", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/castlemaster.gba" },
  { identifier: "rb-gba-cccp", title: "Cccp", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/cccp.gba" },
  { identifier: "rb-gba-chaosthebattleofwizards", title: "Chaosthebattleofwizards", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/chaosthebattleofwizards.gba" },
  { identifier: "rb-gba-chipadvance", title: "Chipadvance", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/chipadvance.gba" },
  { identifier: "rb-gba-chocoboworlddeluxe", title: "Chocoboworlddeluxe", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/chocoboworlddeluxe.gba" },
  { identifier: "rb-gba-clayshooter", title: "Clayshooter", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/clayshooter.gba" },
  { identifier: "rb-gba-cleangameadvance", title: "Cleangameadvance", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/cleangameadvance.gba" },
  { identifier: "rb-gba-codenamehacker", title: "Codenamehacker", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/codenamehacker.gba" },
  { identifier: "rb-gba-cosmic", title: "Cosmic", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/cosmic.gba" },
  { identifier: "rb-gba-crystalclearclone", title: "Crystalclearclone", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/crystalclearclone.gba" },
  { identifier: "rb-gba-cyler", title: "Cyler", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/cyler.gba" },
  { identifier: "rb-gba-deflektor", title: "Deflektor", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/deflektor.gba" },
  { identifier: "rb-gba-doomdarksrevenge", title: "Doomdarksrevenge", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/doomdarksrevenge.gba" },
  { identifier: "rb-gba-elevator", title: "Elevator", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/elevator.gba" },
  { identifier: "rb-gba-eliminator", title: "Eliminator", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/eliminator.gba" },
  { identifier: "rb-gba-factorybots", title: "Factorybots", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/factorybots.gba" },
  { identifier: "rb-gba-fredfirefighter", title: "Fredfirefighter", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/fredfirefighter.gba" },
  { identifier: "rb-gba-frogger", title: "Frogger", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/frogger.gba" },
  { identifier: "rb-gba-frogtris", title: "Frogtris", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/frogtris.gba" },
  { identifier: "rb-gba-gapman", title: "Gapman", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/gapman.gba" },
  { identifier: "rb-gba-gbacards", title: "Gbacards", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/gbacards.gba" },
  { identifier: "rb-gba-gbatactics", title: "Gbatactics", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/gbatactics.gba" },
  { identifier: "rb-gba-goldrunner", title: "Goldrunner", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/goldrunner.gba" },
  { identifier: "rb-gba-goodboyadvance", title: "Goodboyadvance", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/goodboyadvance.gba" },
  { identifier: "rb-gba-gorf", title: "Gorf", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/gorf.gba" },
  { identifier: "rb-gba-hexavirus", title: "Hexavirus", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/hexavirus.gba" },
  { identifier: "rb-gba-hierogyphicman", title: "Hierogyphicman", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/hierogyphicman.gba" },
  { identifier: "rb-gba-holyhell", title: "Holyhell", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/holyhell.gba" },
  { identifier: "rb-gba-impact", title: "Impact", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/impact.gba" },
  { identifier: "rb-gba-jetpack2", title: "Jetpack2", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/jetpack2.gba" },
  { identifier: "rb-gba-jumpingbarnabe", title: "Jumpingbarnabe", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/jumpingbarnabe.gba" },
  { identifier: "rb-gba-jumpingjim", title: "Jumpingjim", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/jumpingjim.gba" },
  { identifier: "rb-gba-klanwars", title: "Klanwars", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/klanwars.gba" },
  { identifier: "rb-gba-llamaboost", title: "Llamaboost", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/llamaboost.gba" },
  { identifier: "rb-gba-looped", title: "Looped", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/looped.gba" },
  { identifier: "rb-gba-looptheloop", title: "Looptheloop", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/looptheloop.gba" },
  { identifier: "rb-gba-matrixrunner", title: "Matrixrunner", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/matrixrunner.gba" },
  { identifier: "rb-gba-memorymuncha", title: "Memorymuncha", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/memorymuncha.gba" },
  { identifier: "rb-gba-metalwarrior4", title: "Metalwarrior4", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/metalwarrior4.gba" },
  { identifier: "rb-gba-moshpit", title: "Moshpit", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/moshpit.gba" },
  { identifier: "rb-gba-nebulus", title: "Nebulus", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/nebulus.gba" },
  { identifier: "rb-gba-negativespace", title: "Negativespace", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/negativespace.gba" },
  { identifier: "rb-gba-ninjasack", title: "Ninjasack", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/ninjasack.gba" },
  { identifier: "rb-gba-pacrun", title: "Pacrun", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/pacrun.gba" },
  { identifier: "rb-gba-paperscissorrocks", title: "Paperscissorrocks", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/paperscissorrocks.gba" },
  { identifier: "rb-gba-pocketmeat", title: "Pocketmeat", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/pocketmeat.gba" },
  { identifier: "rb-gba-powerpig", title: "Powerpig", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/powerpig.gba" },
  { identifier: "rb-gba-pushit", title: "Pushit", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/pushit.gba" },
  { identifier: "rb-gba-santassweatshop", title: "Santassweatshop", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/santassweatshop.gba" },
  { identifier: "rb-gba-shapes", title: "Shapes", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/shapes.gba" },
  { identifier: "rb-gba-snakeinthegrass", title: "Snakeinthegrass", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/snakeinthegrass.gba" },
  { identifier: "rb-gba-spout", title: "Spout", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/spout.gba" },
  { identifier: "rb-gba-superhappy", title: "Superhappy", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/superhappy.gba" },
  { identifier: "rb-gba-superwings", title: "Superwings", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/superwings.gba" },
  { identifier: "rb-gba-sworld3", title: "Sworld3", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/sworld3.gba" },
  { identifier: "rb-gba-tailgunner", title: "Tailgunner", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/tailgunner.gba" },
  { identifier: "rb-gba-tetravex", title: "Tetravex", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/tetravex.gba" },
  { identifier: "rb-gba-tetrigram", title: "Tetrigram", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/tetrigram.gba" },
  { identifier: "rb-gba-thelordsofmidnight", title: "Thelordsofmidnight", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/thelordsofmidnight.gba" },
  { identifier: "rb-gba-timewalker", title: "Timewalker", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/timewalker.gba" },
  { identifier: "rb-gba-tronlordgraga", title: "Tronlordgraga", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/tronlordgraga.gba" },
  { identifier: "rb-gba-waimanu", title: "Waimanu", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/waimanu.gba" },
  { identifier: "rb-gba-wonkieguy", title: "Wonkieguy", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/wonkieguy.gba" },
  { identifier: "rb-gba-yahtzeeherg", title: "Yahtzeeherg", system: "GBA", core: "gba",
    rom: "https://raw.githubusercontent.com/retrobrews/gba-games/master/yahtzeeherg.gba" },
  { identifier: "rb-gbc-blastah", title: "Blastah", system: "GB Color", core: "gb",
    rom: "https://raw.githubusercontent.com/retrobrews/gbc-games/master/blastah.gb" },
  { identifier: "rb-gbc-brickster", title: "Brickster", system: "GB Color", core: "gb",
    rom: "https://raw.githubusercontent.com/retrobrews/gbc-games/master/brickster.gbc" },
  { identifier: "rb-gbc-burly", title: "Burly", system: "GB Color", core: "gb",
    rom: "https://raw.githubusercontent.com/retrobrews/gbc-games/master/burly.gbc" },
  { identifier: "rb-gbc-combatsoccer", title: "Combatsoccer", system: "GB Color", core: "gb",
    rom: "https://raw.githubusercontent.com/retrobrews/gbc-games/master/combatsoccer.gbc" },
  { identifier: "rb-gbc-geometrix", title: "Geometrix", system: "GB Color", core: "gb",
    rom: "https://raw.githubusercontent.com/retrobrews/gbc-games/master/geometrix.gbc" },
  { identifier: "rb-gbc-initiald", title: "Initiald", system: "GB Color", core: "gb",
    rom: "https://raw.githubusercontent.com/retrobrews/gbc-games/master/initiald.gbc" },
  { identifier: "rb-gbc-klondike", title: "Klondike", system: "GB Color", core: "gb",
    rom: "https://raw.githubusercontent.com/retrobrews/gbc-games/master/klondike.gbc" },
  { identifier: "rb-gbc-pokedamon", title: "Pokedamon", system: "GB Color", core: "gb",
    rom: "https://raw.githubusercontent.com/retrobrews/gbc-games/master/pokedamon.gbc" },
  { identifier: "rb-gbc-ucity", title: "Ucity", system: "GB Color", core: "gb",
    rom: "https://raw.githubusercontent.com/retrobrews/gbc-games/master/ucity.gbc" },
  { identifier: "rb-a2600-anguna", title: "Anguna", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/anguna.bin" },
  { identifier: "rb-a2600-bitquest", title: "Bitquest", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/bitquest.bin" },
  { identifier: "rb-a2600-bitquest2", title: "Bitquest2", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/bitquest2.bin" },
  { identifier: "rb-a2600-dkarcade2600", title: "Dkarcade2600", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/dkarcade2600.bin" },
  { identifier: "rb-a2600-emr", title: "Emr", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/emr.bin" },
  { identifier: "rb-a2600-emrii", title: "Emrii", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/emrii.bin" },
  { identifier: "rb-a2600-fishy", title: "Fishy", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/fishy.bin" },
  { identifier: "rb-a2600-flappy-the-duck", title: "Flappy The Duck", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/flappy_the_duck.bin" },
  { identifier: "rb-a2600-halo2600", title: "Halo2600", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/halo2600.bin" },
  { identifier: "rb-a2600-hauntedbakery", title: "Hauntedbakery", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/hauntedbakery.bin" },
  { identifier: "rb-a2600-jammed", title: "Jammed", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/jammed.bin" },
  { identifier: "rb-a2600-kellykangaroo", title: "Kellykangaroo", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/kellykangaroo.bin" },
  { identifier: "rb-a2600-nanowing", title: "Nanowing", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/nanowing.bin" },
  { identifier: "rb-a2600-neko-2600", title: "Neko 2600", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/neko_2600.bin" },
  { identifier: "rb-a2600-pothole", title: "Pothole", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/pothole.bin" },
  { identifier: "rb-a2600-roboninjaclimb", title: "Roboninjaclimb", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/roboninjaclimb.bin" },
  { identifier: "rb-a2600-runtysrevenge", title: "Runtysrevenge", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/runtysrevenge.bin" },
  { identifier: "rb-a2600-sandcastles", title: "Sandcastles", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/sandcastles.bin" },
  { identifier: "rb-a2600-solarplexus", title: "Solarplexus", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/solarplexus.bin" },
  { identifier: "rb-a2600-stardust", title: "Stardust", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/stardust.bin" },
  { identifier: "rb-a2600-threes", title: "Threes", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/threes.bin" },
  { identifier: "rb-a2600-thrust", title: "Thrust", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/thrust.bin" },
  { identifier: "rb-a2600-turtlebay", title: "Turtlebay", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/turtlebay.bin" },
  { identifier: "rb-a2600-winterfortress", title: "Winterfortress", system: "Atari 2600", core: "atari2600",
    rom: "https://raw.githubusercontent.com/retrobrews/atari2600-games/master/winterfortress.bin" },
];

// Tag a catalog entry so the card/player route to the right engine.
function makeRomGame(g) { return { ...g, kind: "rom" }; }
function makeWebGame(g) { return { ...g, kind: "web" }; }

// Minimal storable reference for favorites/history (keeps the fields a saved
// favorite needs so it can still be launched later: ROM core/url, or web url).
function gameRef(g) {
  const ref = { identifier: g.identifier, title: g.title };
  if (g.kind === "rom") { ref.kind = "rom"; ref.system = g.system; ref.core = g.core; ref.rom = g.rom; }
  else if (g.kind === "web") {
    ref.kind = "web"; ref.url = g.url; ref.img = g.img;
    if (g.credit) ref.credit = g.credit;
    if (g.license) ref.license = g.license;
    if (g.source) ref.source = g.source;
  }
  return ref;
}

/* ---------- tiny localStorage helpers ---------- */
function loadList(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}
function saveList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

let favorites = loadList(LS_FAVORITES);   // [{ identifier, title }]
let history = loadList(LS_HISTORY);       // [{ identifier, title }] most-recent first
let userRoms = loadList(LS_USERROMS);     // retro games the user added by URL
let fileRoms = [];                        // ROMs dropped into roms/, loaded from roms.json
let webGames = [];                        // self-hosted HTML5 catalog, loaded from web-games.json
let userWeb = loadList(LS_USERWEB);       // web games the user added by URL

function isFavorite(id) { return favorites.some(g => g.identifier === id); }

function toggleFavorite(game) {
  if (isFavorite(game.identifier)) {
    favorites = favorites.filter(g => g.identifier !== game.identifier);
  } else {
    favorites.unshift(gameRef(game));
  }
  saveList(LS_FAVORITES, favorites);
  renderFavorites();
  refreshFavButtons();
}

function pushHistory(game) {
  history = history.filter(g => g.identifier !== game.identifier);
  history.unshift(gameRef(game));
  history = history.slice(0, HISTORY_LIMIT);
  saveList(LS_HISTORY, history);
  renderHistory();
}

// Wipe the whole recently-played list (favorites + game saves stay).
function clearHistory() {
  if (history.length === 0) return;
  if (!confirm("Clear your recently-played history?")) return;
  history = [];
  saveList(LS_HISTORY, history);
  renderHistory();
}

/* ---------- DOM refs ---------- */
const el = id => document.getElementById(id);
const resultsGrid = el("results-grid");
const resultsStatus = el("results-status");
const resultsTitle = el("results-title");
const loadMoreBtn = el("load-more");

/* ---------- Archive.org search ---------- */
let currentQuery = "";   // user text ("" = browse popular)
let currentPage = 1;
let isLoading = false;

function buildQuery(text) {
  const base = `collection:(${COLLECTION}) AND mediatype:(software)`;
  return text ? `${base} AND (${text})` : base;
}

async function fetchGames(text, page) {
  const q = buildQuery(text);
  // Browsing (no search text) returns a fresh random shuffle every request, so
  // the Home/Flash listing is never the same twice. Random sort happens
  // server-side and we still pull only ROWS_PER_PAGE at a time, so it adds no
  // load cost — the page stays fast.
  const sort = text ? "" : "&sort[]=random";
  const url =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}` +
    `&fl[]=identifier&fl[]=title&rows=${ROWS_PER_PAGE}&page=${page}${sort}&output=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Archive search failed (${res.status})`);
  const data = await res.json();
  return data.response.docs.map(d => ({
    identifier: d.identifier,
    title: d.title || d.identifier,
  }));
}

async function runSearch(text, { append = false } = {}) {
  if (isLoading) return;
  isLoading = true;

  if (!append) {
    currentQuery = text;
    currentPage = 1;
    resultsGrid.innerHTML = "";
    resultsTitle.textContent = text ? `Results for “${text}”` : "Browse games (random)";
  }
  resultsStatus.textContent = "Loading…";
  loadMoreBtn.hidden = true;

  try {
    const games = await fetchGames(currentQuery, currentPage);
    games.forEach(g => resultsGrid.appendChild(makeCard(g)));
    resultsStatus.textContent = resultsGrid.children.length === 0
      ? "No results found."
      : "";
    loadMoreBtn.hidden = games.length < ROWS_PER_PAGE; // probably no more pages
  } catch (err) {
    resultsStatus.textContent = `Couldn’t reach the Internet Archive: ${err.message}`;
  } finally {
    isLoading = false;
  }
}

/* ---------- card rendering ---------- */
function thumbUrl(id) {
  return `https://archive.org/services/img/${encodeURIComponent(id)}`;
}

function makeCard(game) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = game.identifier;

  let thumb;
  if (game.kind === "rom") {
    // ROM items have no Archive thumbnail; use a system-labelled tile.
    thumb = document.createElement("div");
    thumb.className = "card-thumb rom-thumb";
    thumb.textContent = game.system || "ROM";
  } else if (game.kind === "web") {
    // Web games carry their own cover image (screenshot/generated); fall back to a tile.
    thumb = document.createElement("img");
    thumb.className = "card-thumb";
    thumb.loading = "lazy";
    thumb.decoding = "async";
    thumb.alt = game.title;
    if (game.img) thumb.src = game.img;
    thumb.onerror = () => {
      const tile = document.createElement("div");
      tile.className = "card-thumb rom-thumb web-thumb";
      tile.textContent = "WEB";
      thumb.replaceWith(tile);
    };
  } else {
    thumb = document.createElement("img");
    thumb.className = "card-thumb";
    thumb.loading = "lazy";
    thumb.decoding = "async";
    thumb.alt = game.title;
    thumb.src = thumbUrl(game.identifier);
    thumb.onerror = () => { thumb.style.visibility = "hidden"; };
  }

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = game.title;

  // Open-source web games show a tiny attribution line (keeps GPL/MIT credit visible).
  let credit = null;
  if (game.kind === "web" && game.credit) {
    credit = document.createElement("div");
    credit.className = "card-credit";
    credit.textContent = (game.license ? game.license + " · " : "") + game.credit;
  }

  const fav = document.createElement("button");
  fav.className = "fav-toggle" + (isFavorite(game.identifier) ? " active" : "");
  fav.textContent = isFavorite(game.identifier) ? "♥" : "♡";
  fav.title = "Toggle favorite";
  fav.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite(game);
  });

  card.append(thumb, fav, title);
  if (credit) card.append(credit);
  card.addEventListener("click", () => openPlayer(game));
  return card;
}

// The full retro catalog = the built-in homebrew list + anything the user added.
function allConsoleGames() { return CONSOLE_GAMES.concat(fileRoms, userRoms); }

// Retro console shelf. Shows everything when browsing; filters by title/system
// when the user types in the same search bar, so one bar covers both libraries.
function renderConsole(query) {
  const grid = el("console-grid");
  grid.innerHTML = "";
  const q = (query || "").trim().toLowerCase();
  const all = allConsoleGames();
  const list = q
    ? all.filter(g => `${g.title} ${g.system}`.toLowerCase().includes(q))
    : all;
  const empty = list.length === 0;
  // Keep the shelf visible while searching so the "no results" note shows.
  el("console-section").hidden = empty && !q;
  el("console-status").textContent = (empty && q) ? "No results found." : "";
  list.forEach(g => grid.appendChild(makeCard(makeRomGame(g))));
}

/* ---------- User-added ROMs (paste any ROM URL — your library, your call) ----------
 * Pure infrastructure: we don't ship the content, you supply the URLs. Each line
 * may be:  <url>  |  <title>|<url>  |  <core>|<title>|<url>
 * The core is auto-detected from the file extension when you don't specify it.
 * Everything is stored in localStorage (browser data, in your Export backup).
 */
const EXT_CORE = {
  nes:["nes","NES"], fds:["nes","FDS"],
  sfc:["snes","SNES"], smc:["snes","SNES"],
  md:["segaMD","Genesis"], gen:["segaMD","Genesis"], smd:["segaMD","Genesis"], bin:["segaMD","Genesis"],
  "32x":["sega32x","Sega 32X"],
  gg:["segaGG","Game Gear"],
  gba:["gba","GBA"], gbc:["gb","GB Color"], gb:["gb","Game Boy"],
  n64:["n64","N64"], z64:["n64","N64"], v64:["n64","N64"],
  pce:["pce","PC Engine"], ngp:["ngp","Neo Geo Pocket"], ngc:["ngp","Neo Geo Pocket"],
  ws:["ws","WonderSwan"], wsc:["ws","WonderSwan"], vb:["vb","Virtual Boy"],
  a26:["atari2600","Atari 2600"], a78:["atari7800","Atari 7800"], lnx:["lynx","Lynx"],
  col:["coleco","ColecoVision"], nds:["nds","DS"], psx:["psx","PlayStation"], cue:["psx","PlayStation"],
};

function parseRomLine(line) {
  const parts = line.split("|").map(s => s.trim());
  let core, title, url;
  if (parts.length >= 3) { [core, title, url] = parts; }
  else if (parts.length === 2) { [title, url] = parts; }
  else { url = parts[0]; }
  if (!/^https?:\/\//i.test(url || "")) return null;
  const ext = (url.split("?")[0].split("#")[0].split(".").pop() || "").toLowerCase();
  const inf = EXT_CORE[ext];
  if (!core) core = inf ? inf[0] : "segaMD"; // sensible default (Sega-first, as asked)
  const system = inf ? inf[1] : core;
  if (!title) {
    title = decodeURIComponent(url.split("/").pop().split("?")[0]).replace(/\.[^.]+$/, "");
  }
  const identifier = "user-" + Math.abs([...url].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36);
  return { identifier, title: title || "Untitled", system, core, rom: url };
}

// Returns { added, skipped }. Skips blank lines, bad URLs and exact-URL duplicates.
function addUserRoms(text) {
  const known = new Set(allConsoleGames().map(g => g.rom));
  let added = 0, skipped = 0;
  text.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const g = parseRomLine(line);
    if (!g || known.has(g.rom)) { if (line) skipped++; return; }
    known.add(g.rom);
    userRoms.push(g);
    added++;
  });
  saveList(LS_USERROMS, userRoms);
  return { added, skipped };
}

/* ---------- Web games (itch.io HTML5/WebGL, from the crawler) ---------- */
// Built-in catalog + anything the user pasted in.
function allWebGames() { return webGames.concat(userWeb); }

// Load the HTML5 catalog once. Static-site friendly: it's just a JSON file
// generated by tools/build-games.py from the games/ folder, served alongside the page.
async function loadWebGames() {
  try {
    const res = await fetch(WEB_GAMES_URL, { cache: "no-cache" });
    if (res.ok) webGames = await res.json();
  } catch { /* offline / not generated yet — userWeb still works */ }
}

// Load the ROM catalog built from the roms/ folder by tools/build-roms.py.
// Entries look like built-ins ({identifier,title,system,core,rom}); rom is a
// same-origin path (e.g. "roms/sonic.md"), so it loads on a locked-down device.
async function loadRomFiles() {
  try {
    const res = await fetch(ROMS_URL, { cache: "no-cache" });
    if (res.ok) fileRoms = await res.json();
  } catch { /* offline / not generated yet — built-ins + userRoms still work */ }
}

function renderWeb(query) {
  const grid = el("web-grid");
  grid.innerHTML = "";
  const q = (query || "").trim().toLowerCase();
  const all = allWebGames();
  const list = q ? all.filter(g => g.title.toLowerCase().includes(q)) : all;
  el("web-section").hidden = false;
  el("web-status").textContent =
    all.length === 0 ? "No games yet — drop one in games/ and run tools/build-games.py, or add one with “➕ Add game”."
    : list.length === 0 ? "No results found."
    : `${list.length} game${list.length === 1 ? "" : "s"}`;
  list.forEach(g => grid.appendChild(makeCard(makeWebGame(g))));
}

function parseWebLine(line) {
  const parts = line.split("|").map(s => s.trim());
  let title, url;
  if (parts.length >= 2) { url = parts.pop(); title = parts.join(" | "); }
  else { url = parts[0]; }
  // Accept absolute URLs OR same-origin relative paths (e.g. games/x/index.html).
  if (!url || /\s/.test(url) || !(/^https?:\/\//i.test(url) || /^[\w./-]+$/.test(url))) return null;
  if (!title) {
    const segs = url.replace(/\/+$/, "").split("/");
    title = decodeURIComponent(segs[segs.length - 1] || segs[segs.length - 2] || "Web game")
      .replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  }
  const identifier = "webu-" + Math.abs([...url].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36);
  return { identifier, title: title || "Web game", url, img: "" };
}

function addUserWeb(text) {
  const known = new Set(allWebGames().map(g => g.url));
  let added = 0, skipped = 0;
  text.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const g = parseWebLine(line);
    if (!g || known.has(g.url)) { if (line) skipped++; return; }
    known.add(g.url);
    userWeb.push(g);
    added++;
  });
  saveList(LS_USERWEB, userWeb);
  return { added, skipped };
}

function renderShelf(sectionId, gridId, list) {
  const section = el(sectionId);
  const grid = el(gridId);
  grid.innerHTML = "";
  if (list.length === 0) { section.hidden = true; return; }
  section.hidden = false;
  list.forEach(g => grid.appendChild(makeCard(g)));
}

// Active library tab. "home" shows Flash; the others are scoped to one kind.
let currentTab = "home"; // "home" | "flash" | "retro" | "web"

// Favorites/history can hold any kind; on a scoped tab show only that kind.
// (Flash games have no `kind`; retro = "rom"; web = "web".)
function scopeToTab(list) {
  if (currentTab === "flash") return list.filter(g => !g.kind);
  if (currentTab === "retro") return list.filter(g => g.kind === "rom");
  if (currentTab === "web") return list.filter(g => g.kind === "web");
  return list; // home: everything
}

function renderFavorites() { renderShelf("favorites-section", "favorites-grid", scopeToTab(favorites)); }
function renderHistory() { renderShelf("history-section", "history-grid", scopeToTab(history)); }

// Show the sections that belong to the current tab, filtered by `query`.
//   home  -> popular Flash games (favorites/history mixed); others are own tabs
//   flash -> Flash results only (Internet Archive search), Flash-only fav/history
//   retro -> retro grid only (local filter), retro-only fav/history
//   web   -> itch.io HTML5 catalog (local filter), web-only fav/history
// One search bar (under the tabs) serves whatever tab is active.
function tabQuery() { return el("search-input").value.trim(); }

function applyTabView() {
  const query = tabQuery();
  // While searching, hide favorites + recently-played; restore them when the
  // search box is emptied (i.e. you leave the search).
  if (query) {
    el("favorites-section").hidden = true;
    el("history-section").hidden = true;
  } else {
    renderFavorites();
    renderHistory();
  }
  // Hide every specialty shelf; each branch re-shows just what it needs.
  el("console-section").hidden = true;
  el("web-section").hidden = true;
  el("results-section").hidden = true;
  if (currentTab === "retro") {
    renderConsole(query);
  } else if (currentTab === "web") {
    renderWeb(query);
  } else { // home or flash: Flash results
    el("results-section").hidden = false;
    runSearch(query);
  }
}

// Switch tabs: highlight the button, clear the search bar, retarget placeholder.
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === tab));
  const input = el("search-input");
  input.value = "";
  const clearBtn = el("search-clear");
  if (clearBtn) clearBtn.hidden = true;
  input.placeholder =
    tab === "retro" ? "Search retro console games…" :
    tab === "web" ? "Search web games…" :
    tab === "flash" ? "Search Flash games on the Internet Archive…" :
    "Search all games…";
  applyTabView();
}

// Keep all visible ♥/♡ buttons in sync with current favorites state.
function refreshFavButtons() {
  document.querySelectorAll(".card").forEach(card => {
    const active = isFavorite(card.dataset.id);
    const btn = card.querySelector(".fav-toggle");
    if (btn) {
      btn.classList.toggle("active", active);
      btn.textContent = active ? "♥" : "♡";
    }
  });
}

/* ---------- Ruffle player ---------- */
const overlay = el("player-overlay");
const playerStage = el("player-stage");
const playerStatus = el("player-status");
const playerTitle = el("player-title");
const playerFavBtn = el("player-fav");
const playerFullscreenBtn = el("player-fullscreen");
const playerSaveBtn = el("player-save");
const playerLoadBtn = el("player-load");
const muteBtn = el("mute-btn");
let currentGame = null;
let rufflePlayer = null;
let rufflePromise = null;
let romFrame = null;       // <iframe> running EmulatorJS for the current ROM game
let webFrame = null;       // <iframe> running an itch.io / HTML5 web game
let flashBaseline = {};    // Flash SharedObject keys as they were when the SWF opened

// Remove whatever is currently playing (Ruffle, the emulator, or a web game).
function clearStage() {
  if (rufflePlayer) { rufflePlayer.remove(); rufflePlayer = null; }
  if (romFrame) { romFrame.remove(); romFrame = null; }
  if (webFrame) { webFrame.remove(); webFrame = null; }
}

// Save/Load buttons apply to both ROM games and Flash games, but the wording
// differs: retro cores get true emulator save states ("Save"/"Load"), while
// Flash can only back up/restore the game's own SharedObject ("Backup"/"Restore")
// — Ruffle has no VM-snapshot API, so we don't pretend otherwise.
function setSaveControls(show, kind) {
  playerSaveBtn.hidden = !show;
  playerLoadBtn.hidden = !show;
  if (!show) return;
  const flash = kind !== "rom";
  playerSaveBtn.textContent = flash ? "⤓ Backup save" : "⤓ Save";
  playerLoadBtn.textContent = flash ? "⤒ Restore save" : "⤒ Load";
  playerSaveBtn.title = flash
    ? "Back up this game's save data (overwrites your last backup)"
    : "Save state (overwrites your last save)";
  playerLoadBtn.title = flash ? "Restore your backed-up save" : "Load your last save";
}

// Mute applies to every game (Ruffle is the only audio source). Persisted so
// it stays muted across games, refreshes, and sessions.
let isMuted = localStorage.getItem("gamesite.muted") === "1";

function applyMute() {
  if (rufflePlayer) rufflePlayer.volume = isMuted ? 0 : 1;
  muteBtn.textContent = isMuted ? "🔇 Muted" : "🔊 Sound";
  muteBtn.classList.toggle("active", isMuted);
}

function toggleMute() {
  isMuted = !isMuted;
  localStorage.setItem("gamesite.muted", isMuted ? "1" : "0");
  applyMute();
}

// Load the Ruffle bundle once, on first use, instead of on every page load.
function ensureRuffle() {
  if (window.RufflePlayer) return Promise.resolve();
  if (rufflePromise) return rufflePromise;
  rufflePromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/@ruffle-rs/ruffle";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("couldn’t load the Ruffle player"));
    document.head.appendChild(s);
  });
  return rufflePromise;
}

// Find the playable .swf inside an Archive item and return its absolute URL.
async function resolveSwfUrl(identifier) {
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
  if (!res.ok) throw new Error(`metadata ${res.status}`);
  const meta = await res.json();
  const files = meta.files || [];
  const swf =
    files.find(f => /shockwave flash/i.test(f.format || "")) ||
    files.find(f => /\.swf$/i.test(f.name || ""));
  if (!swf) throw new Error("no .swf file in this item");
  // Use /cors/ (not /download/): it serves the file directly with an
  // `Access-Control-Allow-Origin: *` header, so Ruffle's fetch isn't blocked.
  // /download/ 302-redirects to a storage node that sends no CORS header.
  return `https://archive.org/cors/${encodeURIComponent(identifier)}/${swf.name
    .split("/").map(encodeURIComponent).join("/")}`;
}

async function openPlayer(game) {
  if (game.kind === "rom") return openRomPlayer(game);
  if (game.kind === "web") return openWebPlayer(game);

  currentGame = game;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  playerTitle.textContent = game.title;
  playerStatus.textContent = "Loading game…";
  playerStatus.style.display = "";
  updatePlayerFavBtn();
  setSaveControls(true, "flash");
  // Remember the game's SharedObject state as it stands now, so flashSave can
  // tell which localStorage keys this game writes during the session.
  flashBaseline = snapshotForeignKeys();

  // tear down any previous instance
  clearStage();

  pushHistory(game);

  try {
    await ensureRuffle();
    const swfUrl = await resolveSwfUrl(game.identifier);
    const ruffle = window.RufflePlayer.newest();
    rufflePlayer = ruffle.createPlayer();
    playerStage.appendChild(rufflePlayer);
    // Same URL every time => Ruffle reuses the same saved SharedObject (progress).
    await rufflePlayer.load({ url: swfUrl, autoplay: "on", letterbox: "on", volume: isMuted ? 0 : 1 });
    applyMute();
    playerStatus.style.display = "none";
  } catch (err) {
    playerStatus.style.display = "";
    playerStatus.textContent = `Sorry, this game wouldn’t load (${err.message}).`;
  }
}

// Console games run in emulator.html (EmulatorJS). Same overlay, same flow as
// Flash — click a card, it plays here — but routed to the emulator iframe.
function openRomPlayer(game) {
  currentGame = game;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  playerTitle.textContent = game.title;
  playerStatus.textContent = "Loading game…";
  playerStatus.style.display = "";
  updatePlayerFavBtn();
  setSaveControls(true, "rom");

  clearStage();
  pushHistory(game);

  romFrame = document.createElement("iframe");
  romFrame.className = "rom-frame";
  romFrame.allow = "autoplay; fullscreen; gamepad; clipboard-write";
  romFrame.src = `emulator.html?core=${encodeURIComponent(game.core)}&rom=${encodeURIComponent(game.rom)}`;
  playerStage.appendChild(romFrame);
  // emulator.html posts { emu: "ready" } once running -> we hide the overlay then.
}

// Web games (itch.io HTML5/WebGL) just load their play URL in an iframe. They
// keep their own progress in their own origin's storage, so there are no
// Save/Load buttons (we can't snapshot a cross-origin iframe anyway).
function openWebPlayer(game) {
  currentGame = game;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  playerTitle.textContent = game.title;
  playerStatus.textContent = "Loading game…";
  playerStatus.style.display = "";
  updatePlayerFavBtn();
  setSaveControls(false);

  clearStage();
  pushHistory(game);

  webFrame = document.createElement("iframe");
  webFrame.className = "rom-frame";
  webFrame.allow = "autoplay; fullscreen; gamepad; clipboard-write; cross-origin-isolated";
  webFrame.src = game.url;
  webFrame.addEventListener("load", () => { playerStatus.style.display = "none"; });
  playerStage.appendChild(webFrame);
}

function closePlayer() {
  overlay.hidden = true;
  document.body.style.overflow = "";
  clearStage();
  setSaveControls(false);
  currentGame = null;
}

/* ---------- ROM save/load (single slot per game, overrides on re-save) ---------- */
function bytesToB64(bytes) {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Ask the emulator iframe for the current state; it replies with { emu:"state" }.
function romSave() {
  if (romFrame && currentGame) romFrame.contentWindow.postMessage({ emu: "getState" }, "*");
}
function romLoad() {
  if (!romFrame || !currentGame) return;
  const b64 = localStorage.getItem(LS_ROMSAVE + currentGame.identifier);
  if (!b64) { toast("No save yet — press Save first."); return; }
  romFrame.contentWindow.postMessage({ emu: "loadState", data: b64ToBytes(b64) }, "*");
}

/* ---------- Flash save/load (snapshots the game's Ruffle SharedObject) ----------
 * Ruffle has no arbitrary "save state anywhere" API like the emulator does, but
 * it DOES persist a Flash game's own save data (SharedObject) into localStorage.
 * So our Save copies the keys this game wrote during the session into one slot
 * (overwriting the previous slot), and Load restores them and reloads the SWF so
 * Ruffle reads the restored save. It works for games that have an in-game save;
 * it can't snapshot pure mid-action RAM that the game never persisted. The slot
 * lives in localStorage (browser data, included in Export) — never Downloads.
 */

// All localStorage keys that aren't ours (i.e. Ruffle's SharedObject entries).
function snapshotForeignKeys() {
  const snap = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && !k.startsWith("gamesite.")) snap[k] = localStorage.getItem(k);
  }
  return snap;
}

function flashSave() {
  if (!currentGame) return;
  const now = snapshotForeignKeys();
  // Keys this game created or changed since it opened = its save data.
  const changed = {};
  for (const k in now) if (now[k] !== flashBaseline[k]) changed[k] = now[k];
  const prevRaw = localStorage.getItem(LS_FLASHSAVE + currentGame.identifier);
  const slot = Object.assign(prevRaw ? JSON.parse(prevRaw) : {}, changed);
  if (Object.keys(slot).length === 0) { toast("Use the game's own save first"); return; }
  try {
    localStorage.setItem(LS_FLASHSAVE + currentGame.identifier, JSON.stringify(slot));
    toast("Backed up ✓");
  } catch {
    toast("Backup failed (storage full)");
  }
}

function flashLoad() {
  if (!currentGame) return;
  const raw = localStorage.getItem(LS_FLASHSAVE + currentGame.identifier);
  if (!raw) { toast("No save yet — press Save first."); return; }
  try {
    const slot = JSON.parse(raw);
    Object.entries(slot).forEach(([k, v]) => localStorage.setItem(k, v));
    toast("Restored ✓");
    openPlayer(currentGame); // reload so Ruffle re-reads the restored SharedObject
  } catch {
    toast("Couldn’t restore this save");
  }
}

// Player Save/Load buttons + shortcuts route to the right engine for the game.
function playerSave() {
  if (!currentGame) return;
  if (currentGame.kind === "rom") romSave(); else flashSave();
}
function playerLoad() {
  if (!currentGame) return;
  if (currentGame.kind === "rom") romLoad(); else flashLoad();
}

// Messages from emulator.html (ready / save state bytes / load done / errors).
function onEmuMessage(e) {
  const m = e.data || {};
  if (m.emu === "ready") {
    playerStatus.style.display = "none";
  } else if (m.emu === "hotkey") {
    // Keys pressed while the emulator iframe has focus, forwarded out to us.
    if (m.action === "save") romSave();
    else if (m.action === "load") romLoad();
    else if (m.action === "math") showMath(); // panic button still works mid-game
  } else if (m.emu === "state" && m.data && currentGame) {
    const bytes = m.data instanceof Uint8Array ? m.data : new Uint8Array(m.data);
    try {
      localStorage.setItem(LS_ROMSAVE + currentGame.identifier, bytesToB64(bytes));
      toast("Saved ✓");
    } catch {
      toast("Save failed (storage full)");
    }
  } else if (m.emu === "loaded") {
    toast("Loaded ✓");
  } else if (m.emu === "error") {
    toast("Couldn’t save/load this game");
  }
}

// Small transient message inside the player (e.g. "Saved ✓").
let toastTimer = null;
function toast(text) {
  let t = el("player-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "player-toast";
    t.className = "player-toast";
    overlay.querySelector(".player-shell").appendChild(t);
  }
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1500);
}

// Fullscreen the game stage. Ruffle re-scales the SWF to fill the screen
// (letterboxed) on fullscreenchange.
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }
  const target = rufflePlayer || playerStage;
  if (target && target.requestFullscreen) target.requestFullscreen();
}

function updatePlayerFavBtn() {
  if (!currentGame) return;
  const active = isFavorite(currentGame.identifier);
  playerFavBtn.textContent = active ? "♥ Favorited" : "♡ Favorite";
  playerFavBtn.classList.toggle("active", active);
}

/* ---------- Export / Import (cross-device backup) ---------- */
function exportSaves() {
  const dump = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    dump[key] = localStorage.getItem(key);
  }
  const payload = {
    type: "gamesite-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: dump,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gamesite-saves-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importSaves(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const data = parsed && parsed.data;
      if (!data || parsed.type !== "gamesite-backup") {
        throw new Error("not a Gamesite backup file");
      }
      Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
      favorites = loadList(LS_FAVORITES);
      history = loadList(LS_HISTORY);
      renderFavorites();
      renderHistory();
      refreshFavButtons();
      alert("Saves imported. Reopen a game to continue where you left off.");
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

/* =========================================================================
 * Math cover page — shown on every load/reload until "Back" is clicked.
 * Wordle-style daily questions: the set is derived from the calendar day, so
 * everyone visiting on the same (UTC) day gets the exact same 5 questions, and
 * a brand-new set appears at 00:00 UTC. No backend needed — the date is the seed.
 * ========================================================================= */

// Day index since 2026-01-01 (UTC). It's the same value worldwide at any given
// instant, so it makes a perfect shared seed and rolls over exactly at UTC midnight.
function daySeed() {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((todayUTC - Date.UTC(2026, 0, 1)) / DAY_MS);
}

// mulberry32: a tiny deterministic PRNG. The same seed always yields the same
// stream of numbers, so a given day's questions are fully reproducible.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The active PRNG used by the generators. Reseeded from the day in buildMathCover,
// so every rand()/pick() below is deterministic for a given date.
let rng = Math.random;
const rand = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
const pick = arr => arr[rand(0, arr.length - 1)];

// Engine-independent Fisher–Yates shuffle. (A `.sort()` comparator that calls
// rng() would consume the stream differently across browsers and break the
// "same set for everyone" guarantee, so we shuffle explicitly.)
function shuffleSeeded(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Each generator returns { q: "question text", a: numericAnswer }.
const MATH_GENERATORS = [
  () => { // solve ax + b = c
    const a = rand(2, 7), x = rand(1, 12), b = rand(1, 20);
    return { q: `Solve for x:  ${a}x + ${b} = ${a * x + b}`, a: x };
  },
  () => { // solve with x on both sides
    const x = rand(1, 10), a = rand(4, 8), b = rand(2, 3), c1 = rand(1, 15);
    const rightConst = (a - b) * x + c1;
    return { q: `Solve for x:  ${a}x + ${c1} = ${b}x + ${rightConst}`, a: x };
  },
  () => { // evaluate quadratic at x
    const k = rand(1, 3), m = rand(1, 5), n = rand(1, 8), x = rand(1, 5);
    return { q: `Evaluate  ${k}x² + ${m}x + ${n}  when x = ${x}`, a: k * x * x + m * x + n };
  },
  () => { // percent of a number
    const p = pick([5, 10, 20, 25, 50]), ans = rand(2, 24);
    const base = (ans * 100) / p;
    return { q: `What is ${p}% of ${base}?`, a: ans };
  },
  () => { // Pythagorean hypotenuse
    const [la, lb, lc] = pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [7, 24, 25], [9, 12, 15]]);
    return { q: `A right triangle has legs ${la} and ${lb}. Find the hypotenuse.`, a: lc };
  },
  () => { // square root of a perfect square
    const n = rand(4, 20);
    return { q: `Simplify:  √${n * n}`, a: n };
  },
  () => { // exponent
    const exp = pick([2, 3]); const base = exp === 3 ? rand(2, 5) : rand(2, 9);
    return { q: `Evaluate  ${base}${exp === 2 ? "²" : "³"}`, a: base ** exp };
  },
  () => { // order of operations
    const a = rand(2, 9), b = rand(2, 6), c = rand(2, 9);
    return { q: `Evaluate:  ${a} + ${b} × ${c}`, a: a + b * c };
  },
  () => { // slope through two points
    const x1 = rand(-3, 3), y1 = rand(-4, 4), dx = rand(1, 4), m = rand(1, 4);
    return { q: `Find the slope of the line through (${x1}, ${y1}) and (${x1 + dx}, ${y1 + m * dx}).`, a: m };
  },
];

let mathAnswers = []; // correct answers for the 5 shown questions

function buildMathCover() {
  const list = el("math-questions");
  list.innerHTML = "";
  mathAnswers = [];

  // Seed today's PRNG — everything generated below is now deterministic for the day.
  const seed = daySeed();
  rng = makeRng(seed);

  // Stamp the cover with the date + puzzle number so it reads as a daily puzzle.
  const dateEl = el("math-date");
  if (dateEl) {
    const label = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
    });
    dateEl.textContent = `${label} · No. ${seed + 1}`;
  }

  // Pick today's 5 distinct generators (deterministic order from the daily seed).
  const gens = shuffleSeeded(MATH_GENERATORS).slice(0, 5);
  gens.forEach((gen, i) => {
    const { q, a } = gen();
    mathAnswers.push(a);
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "m-q";
    const text = document.createElement("span");
    text.className = "q-text";
    text.textContent = q;
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.dataset.idx = i;
    input.setAttribute("aria-label", q);
    row.append(text, input);
    li.appendChild(row);
    list.appendChild(li);
  });
  el("math-score").textContent = "";
}

// Return to the math cover instantly: stop any running game, leave fullscreen,
// rebuild today's questions (same set all day), and show the cover at the top.
function showMath() {
  if (document.fullscreenElement) document.exitFullscreen();
  if (!overlay.hidden) closePlayer();
  buildMathCover();
  el("math-cover").hidden = false;
  window.scrollTo(0, 0);
}

function checkMath() {
  // Secret entry: answering question 4 with "61" or "33" opens the games on
  // Check, regardless of what that question actually is or whether it's correct.
  const q4 = el("math-questions").querySelector('input[data-idx="3"]');
  if (q4 && (q4.value.trim() === "61" || q4.value.trim() === "33")) {
    el("math-cover").hidden = true;
    maybeShowUpdate();
    return;
  }

  let correct = 0;
  el("math-questions").querySelectorAll("input").forEach(input => {
    const row = input.closest(".m-q");
    const val = parseFloat(input.value);
    const ok = Number.isFinite(val) && Math.abs(val - mathAnswers[input.dataset.idx]) < 1e-6;
    row.classList.toggle("correct", ok);
    row.classList.toggle("wrong", !ok);
    if (ok) correct++;
  });
  el("math-score").textContent = `${correct} / 5 correct`;
}

/* ---------- "What's new" popup (shows once per device) ---------- */
// Triggered when the games are first revealed (so it never shows on the math
// decoy). Marks itself seen immediately, so it pops up exactly once per device
// until UPDATE_ID is bumped for the next announcement.
function maybeShowUpdate() {
  if (localStorage.getItem(LS_UPDATE_SEEN) === UPDATE_ID) return;
  localStorage.setItem(LS_UPDATE_SEEN, UPDATE_ID);
  el("update-overlay").hidden = false;
}
function dismissUpdate() { el("update-overlay").hidden = true; }

/* ---------- wiring ---------- */
function init() {
  buildMathCover();
  el("math-check").addEventListener("click", checkMath);
  // Pressing Enter inside any answer box checks answers too.
  el("math-questions").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); checkMath(); }
  });
  el("to-math-btn").addEventListener("click", showMath);
  el("clear-history-btn").addEventListener("click", clearHistory);

  // Global shortcuts (work anywhere on the site).
  document.addEventListener("keydown", (e) => {
    // Ctrl+L (or Cmd+L) jumps straight back to math.
    if ((e.ctrlKey || e.metaKey) && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      showMath();
      return;
    }
    // Ctrl+M toggles mute.
    if ((e.ctrlKey || e.metaKey) && (e.key === "m" || e.key === "M")) {
      e.preventDefault();
      toggleMute();
    }
    // Esc closes the shortcuts / what's-new popups.
    if (e.key === "Escape" && !el("shortcuts-overlay").hidden) {
      el("shortcuts-overlay").hidden = true;
    }
    if (e.key === "Escape" && !el("update-overlay").hidden) {
      dismissUpdate();
    }
    if (e.key === "Escape" && !el("addroms-overlay").hidden) {
      el("addroms-overlay").hidden = true;
    }
    if (e.key === "Escape" && !el("addweb-overlay").hidden) {
      el("addweb-overlay").hidden = true;
    }
  });

  // The single search bar under the tabs. Submit (Enter) runs the active tab's
  // search — needed for Home/Flash since those hit the Internet Archive API.
  el("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    applyTabView();
  });
  // Show the ✕ only when there's text to clear.
  const updateSearchClear = () => { el("search-clear").hidden = tabQuery() === ""; };

  // Retro + Web are local catalogs, so filter them live as you type. Home/Flash
  // are remote searches and wait for Enter — but clearing the box (native ✕)
  // should leave the search immediately and bring favorites/history back.
  el("search-input").addEventListener("input", () => {
    updateSearchClear();
    if (currentTab === "retro" || currentTab === "web" || tabQuery() === "") applyTabView();
  });
  // Clear + leave the search (used by the ✕ button and the Esc key).
  const leaveSearch = () => {
    el("search-input").value = "";
    updateSearchClear();
    applyTabView();
  };
  el("search-clear").addEventListener("click", () => { leaveSearch(); el("search-input").focus(); });
  // Esc in the search box clears it and leaves the search.
  el("search-input").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      leaveSearch();
      e.target.blur();
    }
  });

  // Tab bar
  document.querySelectorAll(".tab-btn").forEach(btn =>
    btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

  // Infinite scroll: load the next page automatically when the "Load more"
  // sentinel nears the viewport. It's only visible when more pages exist, and
  // isLoading guards against double-firing; the button still works as a manual
  // fallback (and for browsers without IntersectionObserver).
  const loadMore = () => {
    if (isLoading || loadMoreBtn.hidden) return;
    currentPage += 1;
    runSearch(currentQuery, { append: true });
  };
  loadMoreBtn.addEventListener("click", loadMore);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) loadMore();
    }, { rootMargin: "400px" }); // start fetching a bit before it scrolls in
    io.observe(loadMoreBtn);
  }

  el("player-close").addEventListener("click", closePlayer);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePlayer(); });
  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape" && !document.fullscreenElement) closePlayer();
    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
      e.preventDefault(); // override the browser's Find while a game is open
      toggleFullscreen();
    }
    // Quick save / load (retro: also forwarded from inside the emulator iframe;
    // Flash: key events bubble in this same document, so we catch them here).
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      playerSave();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
      playerLoad();
    }
  });

  playerFullscreenBtn.addEventListener("click", toggleFullscreen);
  playerSaveBtn.addEventListener("click", playerSave);
  playerLoadBtn.addEventListener("click", playerLoad);
  window.addEventListener("message", onEmuMessage); // from emulator.html
  muteBtn.addEventListener("click", toggleMute);
  applyMute(); // set the button's initial label from the saved state

  // Shortcuts guide popup
  const shortcutsOverlay = el("shortcuts-overlay");
  el("shortcuts-btn").addEventListener("click", () => { shortcutsOverlay.hidden = false; });
  // Re-open the "What's new" popup on demand (same content as the first-launch one).
  el("whatsnew-btn").addEventListener("click", () => { el("update-overlay").hidden = false; });
  el("shortcuts-close").addEventListener("click", () => { shortcutsOverlay.hidden = true; });
  shortcutsOverlay.addEventListener("click", (e) => {
    if (e.target === shortcutsOverlay) shortcutsOverlay.hidden = true;
  });
  playerFavBtn.addEventListener("click", () => {
    if (currentGame) { toggleFavorite(currentGame); updatePlayerFavBtn(); }
  });

  // "What's new" popup
  el("update-close").addEventListener("click", dismissUpdate);
  el("update-ok").addEventListener("click", dismissUpdate);
  el("update-overlay").addEventListener("click", (e) => {
    if (e.target === el("update-overlay")) dismissUpdate();
  });

  // Add-ROMs importer
  const addromsOverlay = el("addroms-overlay");
  const closeAddroms = () => { addromsOverlay.hidden = true; };
  const showAddromsCount = () => {
    el("addroms-count").textContent =
      `You've added ${userRoms.length} ROM${userRoms.length === 1 ? "" : "s"} to your library.`;
  };
  el("addroms-btn").addEventListener("click", () => {
    el("addroms-input").value = "";
    showAddromsCount();
    addromsOverlay.hidden = false;
    el("addroms-input").focus();
  });
  el("addroms-close").addEventListener("click", closeAddroms);
  addromsOverlay.addEventListener("click", (e) => { if (e.target === addromsOverlay) closeAddroms(); });
  el("addroms-add").addEventListener("click", () => {
    const { added, skipped } = addUserRoms(el("addroms-input").value);
    el("addroms-input").value = "";
    renderConsole(currentTab === "retro" ? tabQuery() : "");
    const parts = [`Added ${added}`];
    if (skipped) parts.push(`${skipped} skipped (duplicate or bad URL)`);
    el("addroms-count").textContent = `${parts.join(" · ")}. Library: ${userRoms.length} ROMs.`;
  });
  el("addroms-clear").addEventListener("click", () => {
    if (userRoms.length === 0) { showAddromsCount(); return; }
    if (!confirm(`Remove all ${userRoms.length} ROMs you added? (Built-in games stay.)`)) return;
    userRoms = [];
    saveList(LS_USERROMS, userRoms);
    renderConsole("");
    showAddromsCount();
  });

  // Add-web-game importer (same pattern as Add ROMs)
  const addwebOverlay = el("addweb-overlay");
  const closeAddweb = () => { addwebOverlay.hidden = true; };
  const showAddwebCount = () => {
    el("addweb-count").textContent =
      `You've added ${userWeb.length} web game${userWeb.length === 1 ? "" : "s"}.`;
  };
  el("addweb-btn").addEventListener("click", () => {
    el("addweb-input").value = "";
    showAddwebCount();
    addwebOverlay.hidden = false;
    el("addweb-input").focus();
  });
  el("addweb-close").addEventListener("click", closeAddweb);
  addwebOverlay.addEventListener("click", (e) => { if (e.target === addwebOverlay) closeAddweb(); });
  el("addweb-add").addEventListener("click", () => {
    const { added, skipped } = addUserWeb(el("addweb-input").value);
    el("addweb-input").value = "";
    if (currentTab === "web") renderWeb(tabQuery());
    const parts = [`Added ${added}`];
    if (skipped) parts.push(`${skipped} skipped (duplicate or bad URL)`);
    el("addweb-count").textContent = `${parts.join(" · ")}. Added games: ${userWeb.length}.`;
  });
  el("addweb-clear").addEventListener("click", () => {
    if (userWeb.length === 0) { showAddwebCount(); return; }
    if (!confirm(`Remove all ${userWeb.length} web games you added? (Crawled games stay.)`)) return;
    userWeb = [];
    saveList(LS_USERWEB, userWeb);
    if (currentTab === "web") renderWeb("");
    showAddwebCount();
  });

  el("export-btn").addEventListener("click", exportSaves);
  el("import-btn").addEventListener("click", () => el("import-file").click());
  el("import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) importSaves(e.target.files[0]);
    e.target.value = "";
  });

  switchTab("home");  // boot into Home: popular Flash, mixed favorites

  // Load the self-hosted catalogs in the background; refresh the relevant tab if
  // the user is already sitting on it when the data arrives.
  loadWebGames().then(() => { if (currentTab === "web") renderWeb(tabQuery()); });
  loadRomFiles().then(() => {
    if (currentTab === "retro" || currentTab === "home") applyTabView();
  });
}

init();
