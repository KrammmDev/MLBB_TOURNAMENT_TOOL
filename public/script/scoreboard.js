function setScore(team, score) {
  for (let i = 1; i <= score; i++) {
    document.getElementById(team + "-" + i).classList.add("win");
  }
}

// Example scores
setScore("t1", 1); // Team 1 = 2 wins
setScore("t2", 1); // Team 2 = 1 win
