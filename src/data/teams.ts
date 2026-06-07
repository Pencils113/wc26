import type { GroupId, Team } from '../types'

const team = (
  id: string,
  name: string,
  shortName: string,
  code: string,
  countryCode: string,
  group: GroupId,
  confederation: string,
  fifaRank: number,
  appearances: number,
  bestFinish: string,
  recentForm: string,
  style: string,
  color: string,
  keyPlayers: [string, string][],
): Team => ({
  id,
  name,
  shortName,
  code,
  countryCode,
  group,
  confederation,
  fifaRank,
  appearances,
  bestFinish,
  recentForm,
  style,
  color,
  keyPlayers: keyPlayers.map(([playerName, note]) => ({
    name: playerName,
    note,
  })),
})

export const teams: Team[] = [
  team('mexico', 'Mexico', 'Mexico', 'MEX', 'mx', 'A', 'Concacaf', 15, 17, 'Quarter-finals', 'Host nation with altitude, noise, and a real home edge.', 'Pressure, wide runners, emotional tempo.', '#0b7a4f', [
    ['Santiago Gimenez', 'Penalty-box striker'],
    ['Edson Alvarez', 'Midfield stopper'],
    ['Hirving Lozano', 'Direct wing threat'],
  ]),
  team('south-africa', 'South Africa', 'South Africa', 'RSA', 'za', 'A', 'CAF', 60, 3, 'Group stage', 'Back after a long absence and comfortable as the spoiler.', 'Athletic transitions and set-piece danger.', '#e3a018', [
    ['Ronwen Williams', 'Shot-stopping captain'],
    ['Teboho Mokoena', 'Long-range midfield engine'],
    ['Percy Tau', 'Creative attacker'],
  ]),
  team('korea-republic', 'Korea Republic', 'Korea', 'KOR', 'kr', 'A', 'AFC', 25, 10, 'Fourth place', 'Reliable tournament side with elite attacking pace.', 'Fast breaks, aggressive pressing, disciplined fullbacks.', '#d0182f', [
    ['Son Heung-min', 'Star finisher'],
    ['Kim Min-jae', 'Elite center back'],
    ['Lee Kang-in', 'Left-footed creator'],
  ]),
  team('czechia', 'Czechia', 'Czechia', 'CZE', 'cz', 'A', 'UEFA', 38, 9, 'Runners-up', 'Awkward, organized, and dangerous if matches get physical.', 'Compact blocks, aerial strength, second balls.', '#1d5ca8', [
    ['Patrik Schick', 'Clinical target forward'],
    ['Tomas Soucek', 'Box-crashing midfielder'],
    ['Adam Hlozek', 'Versatile attacker'],
  ]),

  team('canada', 'Canada', 'Canada', 'CAN', 'ca', 'B', 'Concacaf', 31, 2, 'Group stage', 'Host nation with speed everywhere and a friendly draw.', 'Vertical attacks, wingback surges, young legs.', '#cf142b', [
    ['Alphonso Davies', 'Explosive left side'],
    ['Jonathan David', 'Main goal threat'],
    ['Tajon Buchanan', 'One-v-one runner'],
  ]),
  team('bosnia-herzegovina', 'Bosnia and Herzegovina', 'Bosnia', 'BIH', 'ba', 'B', 'UEFA', 66, 1, 'Group stage', 'A veteran spine with enough craft to make games weird.', 'Deep buildup, direct forward play, set pieces.', '#1f5aa6', [
    ['Edin Dzeko', 'Veteran finisher'],
    ['Amar Dedic', 'Modern fullback'],
    ['Benjamin Tahirovic', 'Midfield connector'],
  ]),
  team('qatar', 'Qatar', 'Qatar', 'QAT', 'qa', 'B', 'AFC', 53, 1, 'Group stage', 'Recent Asian Cup pedigree, but this group asks more.', 'Patient possession and quick combinations.', '#8a1538', [
    ['Akram Afif', 'Creative talisman'],
    ['Almoez Ali', 'Penalty-area forward'],
    ['Hassan Al-Haydos', 'Experienced organizer'],
  ]),
  team('switzerland', 'Switzerland', 'Switzerland', 'SUI', 'ch', 'B', 'UEFA', 20, 12, 'Quarter-finals', 'The classic bracket pool trap: rarely flashy, rarely bad.', 'Low-risk buildup, midfield control, clean defending.', '#d52b1e', [
    ['Granit Xhaka', 'Tempo setter'],
    ['Manuel Akanji', 'Composed defender'],
    ['Breel Embolo', 'Powerful forward'],
  ]),

  team('brazil', 'Brazil', 'Brazil', 'BRA', 'br', 'C', 'CONMEBOL', 5, 22, 'Champions', 'Ceiling is always title-level, even when the ride is messy.', 'Improvisation, wide isolation, relentless attackers.', '#f7d117', [
    ['Vinicius Junior', 'Game-breaking winger'],
    ['Rodrygo', 'Flexible forward'],
    ['Bruno Guimaraes', 'Midfield balance'],
  ]),
  team('morocco', 'Morocco', 'Morocco', 'MAR', 'ma', 'C', 'CAF', 12, 6, 'Semi-finals', 'A proven knockout headache after the 2022 run.', 'Disciplined defending, counters, fearless duels.', '#c1272d', [
    ['Achraf Hakimi', 'Two-way star fullback'],
    ['Sofyan Amrabat', 'Midfield shield'],
    ['Youssef En-Nesyri', 'Aerial finisher'],
  ]),
  team('haiti', 'Haiti', 'Haiti', 'HAI', 'ht', 'C', 'Concacaf', 83, 1, 'Group stage', 'A huge stage return with enough attacking chaos to matter.', 'Direct counters and emotional momentum swings.', '#174ea6', [
    ['Duckens Nazon', 'Primary scorer'],
    ['Frantzdy Pierrot', 'Physical striker'],
    ['Jean-Kevin Duverne', 'Defensive experience'],
  ]),
  team('scotland', 'Scotland', 'Scotland', 'SCO', 'gb-sct', 'C', 'UEFA', 44, 8, 'Group stage', 'Hard to play against and built for tense group matches.', 'Crosses, duels, compact midfield work.', '#005eb8', [
    ['Scott McTominay', 'Late-box scorer'],
    ['Andy Robertson', 'Captain and crosser'],
    ['John McGinn', 'Pressing midfielder'],
  ]),

  team('united-states', 'United States', 'USA', 'USA', 'us', 'D', 'Concacaf', 14, 11, 'Third place', 'Host pressure, but enough talent to make this pool nervous.', 'Pressing, athletic midfield, quick wide attacks.', '#3c3b6e', [
    ['Christian Pulisic', 'Main creator'],
    ['Weston McKennie', 'Box-to-box runner'],
    ['Tyler Adams', 'Defensive organizer'],
  ]),
  team('paraguay', 'Paraguay', 'Paraguay', 'PAR', 'py', 'D', 'CONMEBOL', 48, 8, 'Quarter-finals', 'Never fun to draw: rugged, stubborn, and streetwise.', 'Physical defending, counters, set-piece pressure.', '#d52b1e', [
    ['Miguel Almiron', 'Transition carrier'],
    ['Julio Enciso', 'Creative spark'],
    ['Gustavo Gomez', 'Defensive leader'],
  ]),
  team('australia', 'Australia', 'Australia', 'AUS', 'au', 'D', 'AFC', 24, 6, 'Round of 16', 'Tournament competence in human form.', 'Direct play, aerial defense, high effort.', '#00843d', [
    ['Mathew Ryan', 'Veteran goalkeeper'],
    ['Jackson Irvine', 'Midfield worker'],
    ['Harry Souttar', 'Set-piece giant'],
  ]),
  team('turkiye', 'Turkiye', 'Turkiye', 'TUR', 'tr', 'D', 'UEFA', 26, 2, 'Third place', 'Fun and volatile, which makes them perfect bracket trouble.', 'Creative midfielders, risk-taking, quick shots.', '#e30a17', [
    ['Hakan Calhanoglu', 'Deep playmaker'],
    ['Arda Guler', 'Left-footed creator'],
    ['Kenan Yildiz', 'Young attacker'],
  ]),

  team('germany', 'Germany', 'Germany', 'GER', 'de', 'E', 'UEFA', 10, 20, 'Champions', 'Still carrying name-brand danger even when the form wobbles.', 'Central combinations, technical midfield, fast creators.', '#111111', [
    ['Jamal Musiala', 'Dribbling creator'],
    ['Florian Wirtz', 'Final-third passer'],
    ['Joshua Kimmich', 'Control and delivery'],
  ]),
  team('curacao', 'Curacao', 'Curacao', 'CUW', 'cw', 'E', 'Concacaf', 81, 0, 'Debut', 'The small-nation story everyone will want to follow.', 'Compact defending and opportunistic counters.', '#0057b8', [
    ['Juninho Bacuna', 'Midfield drive'],
    ['Leandro Bacuna', 'Experienced utility man'],
    ['Eloy Room', 'Goalkeeper anchor'],
  ]),
  team('cote-divoire', "Cote d'Ivoire", "Cote d'Ivoire", 'CIV', 'ci', 'E', 'CAF', 46, 3, 'Group stage', 'Plenty of power and a squad nobody should dismiss.', 'Physical midfield, wide speed, set-piece bite.', '#f77f00', [
    ['Simon Adingra', 'Direct winger'],
    ['Franck Kessie', 'Midfield force'],
    ['Sebastien Haller', 'Target forward'],
  ]),
  team('ecuador', 'Ecuador', 'Ecuador', 'ECU', 'ec', 'E', 'CONMEBOL', 32, 4, 'Round of 16', 'Young, intense, and probably underpicked by casual pools.', 'Aggressive pressing and athletic defending.', '#fcd116', [
    ['Moises Caicedo', 'Ball-winning midfielder'],
    ['Piero Hincapie', 'Left-sided defender'],
    ['Enner Valencia', 'Veteran scorer'],
  ]),

  team('netherlands', 'Netherlands', 'Netherlands', 'NED', 'nl', 'F', 'UEFA', 7, 11, 'Runners-up', 'Usually somewhere between elegant and infuriating.', 'Back-three flexibility, measured buildup, elite center backs.', '#ff7f00', [
    ['Virgil van Dijk', 'Defensive captain'],
    ['Cody Gakpo', 'Flexible forward'],
    ['Xavi Simons', 'Line-breaking creator'],
  ]),
  team('japan', 'Japan', 'Japan', 'JPN', 'jp', 'F', 'AFC', 18, 7, 'Round of 16', 'A serious team with enough speed to knock out a giant.', 'Pressing, technical passing, clean rotations.', '#003f8f', [
    ['Takefusa Kubo', 'Creative attacker'],
    ['Kaoru Mitoma', 'Elite dribbler'],
    ['Wataru Endo', 'Midfield platform'],
  ]),
  team('tunisia', 'Tunisia', 'Tunisia', 'TUN', 'tn', 'F', 'CAF', 40, 6, 'Group stage', 'Capable of dragging favorites into uncomfortable games.', 'Compact defending, low-scoring margins, set pieces.', '#e70013', [
    ['Ellyes Skhiri', 'Midfield screen'],
    ['Hannibal Mejbri', 'Energy and edge'],
    ['Youssef Msakni', 'Veteran creator'],
  ]),
  team('sweden', 'Sweden', 'Sweden', 'SWE', 'se', 'F', 'UEFA', 27, 12, 'Runners-up', 'The forwards are scary enough to ruin tidy predictions.', 'Direct attacks, physical duels, ruthless finishing.', '#006aa7', [
    ['Alexander Isak', 'Elite striker'],
    ['Viktor Gyokeres', 'Power runner'],
    ['Dejan Kulusevski', 'Wide creator'],
  ]),

  team('belgium', 'Belgium', 'Belgium', 'BEL', 'be', 'G', 'UEFA', 8, 14, 'Third place', 'Still dangerous, just no longer invincible on paper.', 'Creative overloads and experienced attackers.', '#ef3340', [
    ['Kevin De Bruyne', 'Chance machine'],
    ['Jeremy Doku', 'Dribble threat'],
    ['Amadou Onana', 'Midfield power'],
  ]),
  team('egypt', 'Egypt', 'Egypt', 'EGY', 'eg', 'G', 'CAF', 34, 3, 'Group stage', 'A Salah-led side will never feel like a normal underdog.', 'Compact defending, fast outlets, star finishing.', '#ce1126', [
    ['Mohamed Salah', 'World-class scorer'],
    ['Omar Marmoush', 'Second scorer'],
    ['Mostafa Mohamed', 'Center-forward presence'],
  ]),
  team('iran', 'IR Iran', 'Iran', 'IRN', 'ir', 'G', 'AFC', 21, 6, 'Group stage', 'Experienced, organized, and capable of making games tense.', 'Low blocks, transition shots, veteran forwards.', '#239f40', [
    ['Mehdi Taremi', 'Clever striker'],
    ['Sardar Azmoun', 'Penalty-box threat'],
    ['Alireza Jahanbakhsh', 'Wide experience'],
  ]),
  team('new-zealand', 'New Zealand', 'New Zealand', 'NZL', 'nz', 'G', 'OFC', 89, 2, 'Group stage', 'Clear outsider, but not a team that quits early.', 'Deep defending, target play, set pieces.', '#111111', [
    ['Chris Wood', 'Aerial scorer'],
    ['Liberato Cacace', 'Left-side runner'],
    ['Sarpreet Singh', 'Creative midfielder'],
  ]),

  team('spain', 'Spain', 'Spain', 'ESP', 'es', 'H', 'UEFA', 3, 16, 'Champions', 'A title candidate if the young attackers travel well.', 'Possession, counter-pressing, brave midfield play.', '#aa151b', [
    ['Lamine Yamal', 'Teenage wing star'],
    ['Pedri', 'Control and creativity'],
    ['Rodri', 'Midfield reference point'],
  ]),
  team('cabo-verde', 'Cabo Verde', 'Cabo Verde', 'CPV', 'cv', 'H', 'CAF', 72, 0, 'Debut', 'A first World Cup and a very annoying group-stage opponent.', 'Compact shape, counters, belief.', '#003893', [
    ['Ryan Mendes', 'Experienced attacker'],
    ['Garry Rodrigues', 'Wide threat'],
    ['Dailon Livramento', 'Forward runner'],
  ]),
  team('saudi-arabia', 'Saudi Arabia', 'Saudi Arabia', 'KSA', 'sa', 'H', 'AFC', 56, 6, 'Round of 16', 'Recent proof that they can shock a heavyweight.', 'High energy, quick breaks, front-foot spells.', '#006c35', [
    ['Salem Al-Dawsari', 'Big-game winger'],
    ['Firas Al-Buraikan', 'Forward focal point'],
    ['Saud Abdulhamid', 'Attacking fullback'],
  ]),
  team('uruguay', 'Uruguay', 'Uruguay', 'URU', 'uy', 'H', 'CONMEBOL', 11, 14, 'Champions', 'Nasty in the best soccer sense: skilled and hard-edged.', 'Midfield bite, vertical attacks, elite defenders.', '#6bcff6', [
    ['Federico Valverde', 'All-action midfielder'],
    ['Darwin Nunez', 'Chaos striker'],
    ['Ronald Araujo', 'Defensive force'],
  ]),

  team('france', 'France', 'France', 'FRA', 'fr', 'I', 'UEFA', 2, 16, 'Champions', 'The safest casual pick and still probably underrated.', 'Explosive forwards, depth everywhere, transition speed.', '#1d428a', [
    ['Kylian Mbappe', 'Tournament superstar'],
    ['Antoine Griezmann', 'Creative connector'],
    ['Aurelien Tchouameni', 'Midfield balance'],
  ]),
  team('senegal', 'Senegal', 'Senegal', 'SEN', 'sn', 'I', 'CAF', 19, 3, 'Quarter-finals', 'Athletic, experienced, and capable of punishing mistakes.', 'Fast counters, strong center backs, direct forwards.', '#00853f', [
    ['Sadio Mane', 'Veteran talisman'],
    ['Kalidou Koulibaly', 'Defensive leader'],
    ['Nicolas Jackson', 'Forward movement'],
  ]),
  team('norway', 'Norway', 'Norway', 'NOR', 'no', 'I', 'UEFA', 36, 3, 'Round of 16', 'A bracket swing team because Haaland changes everything.', 'Early service, direct attacks, star finishing.', '#ba0c2f', [
    ['Erling Haaland', 'Relentless scorer'],
    ['Martin Odegaard', 'Creative captain'],
    ['Alexander Sorloth', 'Second striker'],
  ]),
  team('iraq', 'Iraq', 'Iraq', 'IRQ', 'iq', 'I', 'AFC', 58, 1, 'Group stage', 'A proud return with enough bite to complicate Group I.', 'Organized blocks, emotional momentum, target play.', '#ce1126', [
    ['Aymen Hussein', 'Primary striker'],
    ['Ali Jasim', 'Creative attacker'],
    ['Zidane Iqbal', 'Midfield technician'],
  ]),

  team('argentina', 'Argentina', 'Argentina', 'ARG', 'ar', 'J', 'CONMEBOL', 1, 18, 'Champions', 'Defending champions with a deep, settled core.', 'Control, clever forwards, tournament calm.', '#74acdf', [
    ['Lionel Messi', 'All-time creator'],
    ['Julian Alvarez', 'Pressing forward'],
    ['Alexis Mac Allister', 'Midfield connector'],
  ]),
  team('algeria', 'Algeria', 'Algeria', 'ALG', 'dz', 'J', 'CAF', 37, 4, 'Round of 16', 'A proud team that can turn any match into a scrap.', 'Wide creativity, counters, emotional surges.', '#006233', [
    ['Riyad Mahrez', 'Left-footed creator'],
    ['Ismael Bennacer', 'Midfield rhythm'],
    ['Amine Gouiri', 'Forward craft'],
  ]),
  team('austria', 'Austria', 'Austria', 'AUT', 'at', 'J', 'UEFA', 22, 7, 'Third place', 'A fashionable dark-horse type for people who watch Europe.', 'Pressing, structure, coordinated midfield movement.', '#ed2939', [
    ['David Alaba', 'Leader and passer'],
    ['Marcel Sabitzer', 'Midfield runner'],
    ['Christoph Baumgartner', 'Final-third timing'],
  ]),
  team('jordan', 'Jordan', 'Jordan', 'JOR', 'jo', 'J', 'AFC', 68, 0, 'Debut', 'A debut side with enough attacking talent to earn respect.', 'Counters, wide service, fearless forwards.', '#007a3d', [
    ['Musa Al-Taamari', 'Star winger'],
    ['Yazan Al-Naimat', 'Mobile striker'],
    ['Nizar Al-Rashdan', 'Midfield worker'],
  ]),

  team('portugal', 'Portugal', 'Portugal', 'POR', 'pt', 'K', 'UEFA', 6, 8, 'Third place', 'Too much talent to ignore, even if the roles get debated.', 'Technical control, elite creators, deep bench.', '#006600', [
    ['Bruno Fernandes', 'Chance creator'],
    ['Bernardo Silva', 'Control winger'],
    ['Cristiano Ronaldo', 'Box finisher'],
  ]),
  team('uzbekistan', 'Uzbekistan', 'Uzbekistan', 'UZB', 'uz', 'K', 'AFC', 57, 0, 'Debut', 'A debutant with real structure and a few players to know.', 'Disciplined defending and quick counters.', '#1eb53a', [
    ['Eldor Shomurodov', 'Veteran striker'],
    ['Abbosbek Fayzullaev', 'Young creator'],
    ['Abdukodir Khusanov', 'High-end defender'],
  ]),
  team('colombia', 'Colombia', 'Colombia', 'COL', 'co', 'K', 'CONMEBOL', 13, 6, 'Quarter-finals', 'Joyful and dangerous, with a real path to a run.', 'Wide attacks, midfield duels, crowd energy.', '#fcd116', [
    ['Luis Diaz', 'Explosive winger'],
    ['James Rodriguez', 'Set-piece artist'],
    ['Jhon Duran', 'Power forward'],
  ]),
  team('congo-dr', 'Congo DR', 'Congo DR', 'COD', 'cd', 'K', 'CAF', 61, 1, 'Group stage', 'Physical enough to make every favorite uncomfortable.', 'Power, counters, aerial pressure.', '#007fff', [
    ['Yoane Wissa', 'Direct forward'],
    ['Chancel Mbemba', 'Defensive captain'],
    ['Cedric Bakambu', 'Experienced scorer'],
  ]),

  team('england', 'England', 'England', 'ENG', 'gb-eng', 'L', 'UEFA', 4, 16, 'Champions', 'Loaded enough that anything short of late rounds feels loud.', 'Technical attackers, set pieces, controlled tempo.', '#cf142b', [
    ['Jude Bellingham', 'Box-to-box star'],
    ['Harry Kane', 'Complete striker'],
    ['Bukayo Saka', 'Right-side creator'],
  ]),
  team('croatia', 'Croatia', 'Croatia', 'CRO', 'hr', 'L', 'UEFA', 23, 6, 'Runners-up', 'Never count them out until someone physically removes them.', 'Midfield composure, tournament nerve, patient buildup.', '#171796', [
    ['Luka Modric', 'Midfield legend'],
    ['Josko Gvardiol', 'Elite defender'],
    ['Mateo Kovacic', 'Press-resistant carrier'],
  ]),
  team('ghana', 'Ghana', 'Ghana', 'GHA', 'gh', 'L', 'CAF', 47, 4, 'Quarter-finals', 'High-variance and fun, exactly the kind of team that flips pools.', 'Transitions, physical midfield, wide speed.', '#fcd116', [
    ['Mohammed Kudus', 'Creative attacker'],
    ['Thomas Partey', 'Midfield presence'],
    ['Inaki Williams', 'Direct forward'],
  ]),
  team('panama', 'Panama', 'Panama', 'PAN', 'pa', 'L', 'Concacaf', 35, 1, 'Group stage', 'A tough Concacaf side that will not be intimidated.', 'Direct play, defensive edge, transition moments.', '#005293', [
    ['Adalberto Carrasquilla', 'Midfield creator'],
    ['Michael Murillo', 'Attacking fullback'],
    ['Jose Fajardo', 'Forward outlet'],
  ]),
]

export const teamsById = Object.fromEntries(teams.map((item) => [item.id, item])) as Record<
  string,
  Team
>

export const teamsByGroup = teams.reduce(
  (groups, item) => {
    groups[item.group].push(item)
    return groups
  },
  {
    A: [],
    B: [],
    C: [],
    D: [],
    E: [],
    F: [],
    G: [],
    H: [],
    I: [],
    J: [],
    K: [],
    L: [],
  } as Record<GroupId, Team[]>,
)
