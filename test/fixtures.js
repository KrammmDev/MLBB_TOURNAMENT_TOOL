'use strict';
function fixture() {
  const team = name => ({ teamname: name, score: '0', totalgold: 0, turret: 0, lord: 0,
    turtle: 0, playerlist: Array.from({ length: 5 }, (_, i) => ({ name: `Player ${i + 1}`,
      hero: '', level: 0, KDA: '0/0/0', gold: 0, spell: 'idle', itemlist: Array(6).fill('idle') })) });
  return { game_number: 1, game_duration: '00:00', winmatches: 'none',
    teamdata: { blueteam: team('BLUE'), redteam: team('RED') } };
}
module.exports = { fixture };
