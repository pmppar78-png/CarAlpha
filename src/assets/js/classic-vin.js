/* Car Alpha — Classic (pre-1981) VIN / serial number decoder.
 * Decodes only from documented code tables (see /classic-vin-decoder/methodology/).
 * Every field carries a confidence level; anything not in a verified table is reported as "can't confirm". Never guesses. */
(function () {
  'use strict';
  var H = 'high', M = 'medium', U = 'unconfirmed';
  function f(label, value, conf, note) { return { label: label, value: value, conf: conf, note: note || '' }; }
  function clean(raw) { return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  /* ---------- GM (Chevrolet focus) ---------- */
  var GM_DIV = { '1': 'Chevrolet', '2': 'Pontiac', '3': 'Oldsmobile', '4': 'Buick', '6': 'Cadillac' };
  // Chevrolet final-assembly plant letters (chevellestuff.net 1968/1969 plant tables)
  var CHEV_PLANT = { A: 'Atlanta (Lakewood), Georgia', B: 'Baltimore, Maryland', C: 'South Gate, California', D: 'Doraville, Georgia', F: 'Flint, Michigan', G: 'Framingham, Massachusetts', J: 'Janesville, Wisconsin', K: 'Kansas City (Leeds), Missouri', L: 'Van Nuys (Los Angeles), California', N: 'Norwood, Ohio', R: 'Arlington, Texas', S: 'St. Louis, Missouri', T: 'Tarrytown, New York', U: 'Lordstown, Ohio', W: 'Willow Run, Michigan', Y: 'Wilmington, Delaware', Z: 'Fremont, California', '1': 'Oshawa, Ontario (or Ste. Therese, Quebec), Canada' };
  // Chevelle series (2nd-3rd chars), 1968 & 1969 (chevellestuff.net)
  var CHEVELLE = {
    8: { '31': 'Chevelle 300, 6-cyl', '32': 'Chevelle 300, V8', '33': 'Chevelle 300 Deluxe / El Camino, 6-cyl', '34': 'Chevelle 300 Deluxe / El Camino, V8', '35': 'Malibu / El Camino Custom, 6-cyl', '36': 'Malibu / El Camino Custom, V8', '37': 'Concours, 6-cyl', '38': 'SS 396 / Concours, V8' },
    9: { '33': 'Chevelle 300 Deluxe / Greenbrier, 6-cyl', '34': 'Chevelle 300 Deluxe / Greenbrier, V8', '35': 'Malibu, 6-cyl', '36': 'Malibu, V8', '38': 'Concours, V8' }
  };
  var CHEVELLE_BODY = { '27': '2-door coupe', '35': '4-door wagon, 2 seats', '36': '4-door wagon, 2 seats, dual tailgate', '37': '2-door sport coupe (hardtop)', '39': '4-door sport sedan', '67': '2-door convertible', '69': '4-door sedan', '80': '2-door sedan pickup (El Camino)' };
  // Corvette 1972–1980 engine letters by year (vettehead.com, cc3.fr)
  var VETTE_ENG = {
    1972: { K: '350 V8 base (200 hp)', L: '350 V8 LT1 (255 hp)', W: '454 V8 LS5 (270 hp)' },
    1973: { J: '350 V8 L48 (190 hp)', T: '350 V8 L82 (250 hp)', Z: '454 V8 LS4 (275 hp)' },
    1974: { J: '350 V8 L48 (195 hp)', T: '350 V8 L82 (250 hp)', Z: '454 V8 LS4 (270 hp)' },
    1975: { J: '350 V8 L48 (165 hp)', T: '350 V8 L82 (205 hp)' },
    1976: { L: '350 V8 L48 (180 hp)', X: '350 V8 L82 (210 hp)' },
    1977: { L: '350 V8 L48 (180 hp)', X: '350 V8 L82 (210 hp)' },
    1978: { L: '350 V8 L48 (175 hp)', X: '350 V8 L82 (220 hp)' },
    1979: { '8': '350 V8 L48 (195 hp)', '4': '350 V8 L82 (225 hp)' },
    1980: { H: '305 V8 LG4 (180 hp, California)', '8': '350 V8 L48 (190 hp)', '6': '350 V8 L82 (230 hp)' }
  };
  var CAMARO_START = { 1967: 100001, 1968: 300001, 1969: 500001 };

  function decodeGM65(v) {
    var out = { format: 'GM 13-character serial (1965–1971 layout)', fields: [], notes: [], vehicle: {} };
    var div = v[0], ser = v.substr(1, 2), body = v.substr(3, 2), yd = v[5], plant = v[6], seq = v.substr(7);
    var yMap = { '5': 1965, '6': 1966, '7': 1967, '8': 1968, '9': 1969, '0': 1970, '1': 1971 };
    var year = yMap[yd];
    var make = GM_DIV[div];
    out.fields.push(f('Division', make ? make + ' (GM)' : 'Code ' + div, make ? (div === '1' ? H : M) : U, make ? '' : 'Not a GM division code we can confirm.'));
    if (year) { out.fields.push(f('Model year', String(year), H)); out.vehicle.year = year; }
    else out.fields.push(f('Model year', 'Year digit ' + yd, U, 'This digit is outside the 1965–1971 range this layout was used for.'));
    if (make) out.vehicle.make = make;
    var model = null, series = null, bodyTxt = null, conf = U, engine = null;
    if (div === '1') {
      if ((ser === '23' || ser === '24') && (body === '37' || body === '67') && year >= 1967 && year <= 1969) {
        model = 'Camaro'; series = 'Camaro, ' + (ser === '23' ? '6-cylinder' : 'V8'); bodyTxt = body === '37' ? '2-door sport coupe' : '2-door convertible'; conf = H;
        engine = ser === '23' ? '6-cylinder (exact engine not in VIN)' : 'V8 (exact engine not in VIN)';
        out.notes.push('A 1967–69 Camaro VIN does not identify Z/28, SS or RS packages. Those are confirmed through the cowl tag, documentation and the engine stamping.');
        if (CAMARO_START[year] && +seq < CAMARO_START[year]) out.notes.push('Heads up: Camaro sequence numbers for ' + year + ' started at ' + CAMARO_START[year] + '. This number is lower, so double-check the VIN plate.');
      } else if (ser === '94' && (body === '37' || body === '67') && year) {
        model = 'Corvette'; series = 'Corvette (V8)'; bodyTxt = body === '37' ? 'Coupe' : 'Convertible'; conf = year >= 1968 ? H : M; engine = 'V8 (exact engine not in VIN; check the engine pad suffix)';
      } else if (CHEVELLE[yd] && ser[0] === '3' && CHEVELLE[yd][ser] && year >= 1968 && year <= 1969) {
        model = 'Chevelle'; series = CHEVELLE[yd][ser]; bodyTxt = CHEVELLE_BODY[body] || null; conf = H;
        engine = /V8/.test(series) ? 'V8 (exact engine not in VIN)' : '6-cylinder (exact engine not in VIN)';
        if (ser === '38' && year === 1968) out.notes.push('Series 138 covers SS 396 and Concours V8. A real SS 396 is confirmed by the engine stamping and documentation, not the VIN alone.');
        if (year === 1969) out.notes.push('In 1969 the SS 396 was an option package, so the VIN alone cannot confirm an SS.');
      }
    }
    if (model) {
      out.vehicle.model = model;
      out.fields.push(f('Model / series', series, conf));
      out.fields.push(f('Body style', bodyTxt || 'Body code ' + body, bodyTxt ? conf : U));
      if (engine) out.fields.push(f('Engine', engine, conf));
    } else {
      out.fields.push(f('Model / series', 'Series code ' + ser, U, 'Not in our verified tables yet. Check the cowl/trim tag or a division-specific guide.'));
      out.fields.push(f('Body style', 'Body code ' + body, U));
      out.fields.push(f('Engine', 'Not encoded in this VIN layout', U, '1965–71 GM VINs only hint at 6-cyl vs V8 for some series.'));
    }
    if (div === '1' && CHEV_PLANT[plant]) out.fields.push(f('Assembly plant', CHEV_PLANT[plant], model === 'Camaro' && /[NL]/.test(plant) || model === 'Corvette' && plant === 'S' ? H : M));
    else out.fields.push(f('Assembly plant', 'Plant code ' + plant, U, 'Plant letters differ by GM division; we only decode Chevrolet plants.'));
    out.fields.push(f('Sequence number', seq, H, 'Plant build sequence. It counts all cars of that line at the plant, not a model-only production number.'));
    return out;
  }

  function decodeGM72(v) {
    var out = { format: 'GM 13-character serial (1972–1980 layout)', fields: [], notes: [], vehicle: {} };
    var div = v[0], ser = v[1], body = v.substr(2, 2), eng = v[4], yd = v[5], plant = v[6], seq = v.substr(7);
    var year = yd === 'A' ? 1980 : (/[2-9]/.test(yd) ? 1970 + +yd : null);
    var make = GM_DIV[div];
    out.fields.push(f('Division', make ? make + ' (GM)' : 'Code ' + div, make ? (div === '1' ? H : M) : U));
    if (make) out.vehicle.make = make;
    out.fields.push(year ? f('Model year', String(year), H) : f('Model year', 'Year code ' + yd, U));
    if (year) out.vehicle.year = year;
    if (div === '1' && ser === 'Z' && /^(37|67|87)$/.test(body)) {
      out.vehicle.model = 'Corvette';
      out.fields.push(f('Model / series', 'Corvette', H));
      out.fields.push(f('Body style', body === '67' ? 'Convertible' : 'Coupe', H));
      var e = year && VETTE_ENG[year] && VETTE_ENG[year][eng];
      out.fields.push(e ? f('Engine', e, H) : f('Engine', 'Engine code ' + eng, U, 'Not a documented Corvette code for this year. Re-check the character.'));
      out.fields.push(f('Assembly plant', plant === 'S' ? 'St. Louis, Missouri' : 'Plant code ' + plant, plant === 'S' ? H : U));
    } else {
      out.fields.push(f('Model / series', 'Series code ' + ser, U, 'Not in our verified tables yet.'));
      out.fields.push(f('Body style', 'Body code ' + body, U));
      out.fields.push(f('Engine', 'Engine code ' + eng, U, 'GM engine letters changed by year and division, so we only decode them where documented.'));
      out.fields.push(div === '1' && CHEV_PLANT[plant] ? f('Assembly plant', CHEV_PLANT[plant], M) : f('Assembly plant', 'Plant code ' + plant, U));
    }
    out.fields.push(f('Sequence number', seq, H, 'Plant build sequence.'));
    return out;
  }

  /* ---------- Ford 11-character (Mustang tables) ---------- */
  var FORD_PLANT = { F: 'Dearborn, Michigan', R: 'San Jose, California', T: 'Metuchen, New Jersey' };
  var MUSTANG_BODY = [
    { c: '07', y: [1965, 1966], t: 'Hardtop' }, { c: '08', y: [1965, 1966], t: 'Convertible' }, { c: '09', y: [1965, 1966], t: 'Fastback (2+2)' },
    { c: '01', y: [1967, 1973], t: 'Hardtop' }, { c: '02', y: [1967, 1973], t: 'Fastback / SportsRoof' }, { c: '03', y: [1967, 1973], t: 'Convertible' },
    { c: '04', y: [1970, 1973], t: 'Grandé hardtop' }, { c: '05', y: [1970, 1973], t: 'Mach 1 SportsRoof' }
  ];
  var MUSTANG_ENG = [
    ['A', 1965, 1967, '289 V8 4-barrel (225 hp)'], ['C', 1965, 1967, '289 V8 2-barrel (200 hp)'], ['C', 1968, 1968, '289 V8 2-barrel (195 hp)'], ['C', 1971, 1971, '429 V8 Cobra Jet'],
    ['D', 1965, 1965, '289 V8 4-barrel (early 1964½ cars)'], ['F', 1965, 1965, '260 V8 2-barrel (1964½ cars)'], ['F', 1968, 1973, '302 V8 2-barrel'],
    ['G', 1969, 1970, '302 V8 Boss 302'], ['H', 1969, 1969, '351 Windsor V8 2-barrel'], ['H', 1970, 1973, '351 Cleveland V8 2-barrel'],
    ['K', 1965, 1967, '289 V8 High Performance (271 hp)'], ['L', 1969, 1973, '250 inline-6'], ['M', 1969, 1969, '351 Windsor V8 4-barrel'], ['M', 1970, 1971, '351 Cleveland V8 4-barrel'],
    ['Q', 1969, 1970, '428 V8 Cobra Jet'], ['Q', 1971, 1971, '351 V8 Cobra Jet'], ['Q', 1972, 1973, '351 Cleveland V8 4-barrel'], ['R', 1969, 1970, '428 V8 Cobra Jet Ram Air'], ['R', 1971, 1971, '351 V8 Boss 351'],
    ['S', 1967, 1969, '390 V8 4-barrel'], ['T', 1965, 1970, '200 inline-6'], ['U', 1965, 1965, '170 inline-6 (1964½ cars)'], ['W', 1968, 1968, '427 V8'], ['X', 1968, 1968, '390 V8 2-barrel'], ['Z', 1969, 1970, '429 V8 Boss 429']
  ];
  function mustangEngine(code, y) { for (var i = 0; i < MUSTANG_ENG.length; i++) { var e = MUSTANG_ENG[i]; if (e[0] === code && y >= e[1] && y <= e[2]) return e[3]; } return null; }

  function decodeFord(v) {
    var out = { format: 'Ford 11-character serial (1960s–1970s)', fields: [], notes: [], vehicle: { make: 'Ford' } };
    var yd = +v[0], plant = v[1], body = v.substr(2, 2), eng = v[4], seq = v.substr(5);
    var cands = [1960 + yd, 1970 + yd];
    var mb = MUSTANG_BODY.filter(function (b) { return b.c === body; });
    var mustangYears = cands.filter(function (y) { return mb.some(function (b) { return y >= b.y[0] && y <= b.y[1]; }); });
    out.fields.push(f('Make', 'Ford Motor Company', H, 'An 11-character serial in this pattern is Ford’s pre-1981 layout.'));
    if (mustangYears.length === 1) {
      var y = mustangYears[0], bt = mb.filter(function (b) { return y >= b.y[0] && y <= b.y[1]; })[0].t;
      out.vehicle.year = y; out.vehicle.model = 'Mustang';
      out.fields.push(f('Model year', String(y), M, 'If this is a first-generation Mustang (1965–73). Ford reused the year digit each decade.'));
      out.fields.push(f('Model (if Mustang)', 'Mustang', M, 'Body code ' + body + ' matches the Mustang table for ' + y + '. Confirm with the door data plate.'));
      out.fields.push(f('Body style', bt, M));
      var e = mustangEngine(eng, y);
      out.fields.push(e ? f('Engine', e, M, 'From the ' + y + ' Mustang engine table.') : f('Engine', 'Engine code ' + eng, U, 'Not a documented ' + y + ' Mustang engine letter.'));
      if (y === 1965 && /[DFU]/.test(eng)) out.notes.push('Codes D, F and U point to an early “1964½” Mustang, which Ford titled as a 1965.');
    } else {
      out.fields.push(f('Model year', cands.join(' or '), U, 'Ford’s first digit is the last digit of the year, so the decade can’t be confirmed from the serial alone. Check the title or data plate.'));
      out.fields.push(f('Model / body', 'Body code ' + body, U, 'Not matched to a Mustang year we can confirm. Other Ford lines aren’t in our verified tables yet.'));
      out.fields.push(f('Engine', 'Engine code ' + eng, U, 'Ford engine letters changed meaning by year.'));
    }
    out.fields.push(FORD_PLANT[plant] ? f('Assembly plant', FORD_PLANT[plant], out.vehicle.model ? H : M) : f('Assembly plant', 'Plant code ' + plant, U, 'Not in our verified Ford plant table.'));
    out.fields.push(f('Consecutive unit number', seq, H, 'Ford numbered each plant’s cars from 100001 each model year.'));
    return out;
  }

  /* ---------- Chrysler / Mopar 13-character (1968–1970 tables) ---------- */
  var MOPAR_LINE = { B: ['Plymouth', 'Barracuda'], V: ['Plymouth', 'Valiant'], R: ['Plymouth', 'Belvedere / Satellite'], P: ['Plymouth', 'Fury'], C: ['Chrysler', 'Chrysler'], Y: ['Imperial', 'Imperial'], L: ['Dodge', 'Dart'], W: ['Dodge', 'Coronet'], X: ['Dodge', 'Charger'], D: ['Dodge', 'Polara / Monaco'], J: ['Dodge', 'Challenger'] };
  var PRICE = { E: 'Economy', L: 'Low', M: 'Medium', H: 'High', P: 'Premium', S: 'Special', K: 'Police', T: 'Taxi', N: 'New York Taxi', O: 'Super Stock', X: 'Fast Top' };
  // Model names by car line + price class + year (factory bulletins via americanmusclecarfacts.com)
  var MOPAR_MODEL = {
    X: { 1968: { P: 'Charger', S: 'Charger R/T' }, 1969: { P: 'Charger', S: 'Charger R/T', X: 'Charger 500' }, 1970: { H: 'Charger', P: 'Charger 500', S: 'Charger R/T' } },
    W: { 1968: { L: 'Coronet', H: 'Coronet 440', P: 'Coronet 500', S: 'Coronet R/T' }, 1969: { L: 'Coronet Deluxe', M: 'Super Bee', H: 'Coronet 440', P: 'Coronet 500', S: 'Coronet R/T' }, 1970: { L: 'Coronet Deluxe', M: 'Super Bee', H: 'Coronet 440', P: 'Coronet 500', S: 'Coronet R/T' } },
    J: { 1970: { H: 'Challenger', S: 'Challenger R/T' } },
    R: { 1968: { L: 'Belvedere', M: 'Road Runner', H: 'Satellite', P: 'Sport Satellite', S: 'GTX' }, 1969: { L: 'Belvedere', M: 'Road Runner', H: 'Satellite', P: 'Sport Satellite', S: 'GTX' }, 1970: { L: 'Belvedere', M: 'Road Runner', H: 'Satellite', P: 'Sport Satellite', S: 'GTX' } },
    B: { 1968: { H: 'Barracuda' }, 1969: { H: 'Barracuda' }, 1970: { H: 'Barracuda', P: 'Barracuda Gran Coupe', S: '’Cuda' } },
    L: { 1968: { L: 'Dart', H: 'Dart 270', P: 'Dart GT', S: 'Dart GTS' }, 1969: { H: 'Dart Custom', P: 'Dart GT', S: 'Dart GTS' }, 1970: { H: 'Dart Custom', M: 'Dart Swinger 340' } }
  };
  var MOPAR_BODY = { '21': '2-door sedan / coupe', '23': '2-door hardtop', '27': 'Convertible', '29': '2-door sports hardtop', '41': '4-door sedan', '43': '4-door hardtop', '45': 'Station wagon, 2 seats', '46': 'Station wagon, 3 seats' };
  var MOPAR_ENG = {
    1968: { A: '170 six', B: '225 six', C: 'Special-order six', D: '273 V8', E: '273 V8 high performance', F: '318 V8', G: '383 V8', H: '383 V8 high performance', J: '426 Hemi V8', K: '440 V8', L: '440 V8 high performance', M: 'Special-order V8', N: '340 V8', P: '340 V8' },
    1969: { A: '170 six', B: '225 six', C: 'Special-order six', D: '273 V8', F: '318 V8', G: '383 V8', H: '383 V8 high performance', J: '426 Hemi V8', K: '440 V8', L: '440 V8 high performance', M: 'Special-order V8 (used on 1969 440 Six Pack cars)', P: '340 V8' },
    1970: { B: '198 six', C: '225 six', G: '318 V8', L: '383 V8 (2-barrel or 330 hp 4-barrel)', N: '383 V8 high performance (335 hp)', R: '426 Hemi V8', U: '440 V8 4-barrel high performance', V: '440 V8 Six Pack (3×2-barrel)' }
  };
  var MOPAR_PLANT = { A: 'Lynch Road (Detroit), Michigan', B: 'Hamtramck, Michigan', E: 'Los Angeles, California', G: 'St. Louis, Missouri' };

  function decodeMopar(v) {
    var out = { format: 'Chrysler Corporation 13-character serial (1968–1970 tables)', fields: [], notes: [], vehicle: {} };
    var line = v[0], pc = v[1], body = v.substr(2, 2), eng = v[4], yd = v[5], plant = v[6], seq = v.substr(7);
    var year = { '8': 1968, '9': 1969, '0': 1970 }[yd];
    var ln = MOPAR_LINE[line];
    var tableYear = year && ln && (line !== 'J' || year === 1970);
    if (!tableYear) {
      out.fields.push(f('Car line', ln ? ln[0] + ' ' + ln[1] + ' (1968–70 code)' : 'Code ' + line, U));
      out.fields.push(f('Model year', 'Year digit ' + yd, U, 'Our verified Chrysler tables cover 1968–1970. Other years use different code meanings.'));
      out.fields.push(f('Body style', MOPAR_BODY[body] ? MOPAR_BODY[body] + ' (1968–74 meaning)' : 'Body code ' + body, MOPAR_BODY[body] ? M : U));
      out.fields.push(f('Engine', 'Engine code ' + eng, U, 'Chrysler engine letters change by year.'));
      out.fields.push(f('Sequence number', seq, H));
      return out;
    }
    out.vehicle.year = year; out.vehicle.make = ln[0];
    var mm = MOPAR_MODEL[line] && MOPAR_MODEL[line][year] && MOPAR_MODEL[line][year][pc];
    out.vehicle.model = mm ? mm.replace(/ (R\/T|500|440|Deluxe|Custom|GT|GTS|270|Gran Coupe|Swinger 340)$/, '') : ln[1].split(' / ')[0];
    out.fields.push(f('Make / car line', ln[0] + ' ' + ln[1], H));
    out.fields.push(f('Model year', String(year), M, 'A digit of 8, 9 or 0 can also mean 1978, 1979 or 1980. This reading assumes a 1968–70 car, so confirm with the title.'));
    out.fields.push(mm ? f('Model', mm, H, 'Price class ' + pc + ' (' + (PRICE[pc] || '?') + ').') : f('Price class', PRICE[pc] ? PRICE[pc] + ' (' + pc + ')' : 'Code ' + pc, PRICE[pc] ? M : U, 'Exact model name for this class isn’t in our verified table.'));
    out.fields.push(MOPAR_BODY[body] ? f('Body style', MOPAR_BODY[body], H) : f('Body style', 'Body code ' + body, U));
    var e = MOPAR_ENG[year][eng];
    out.fields.push(e ? f('Original engine', e, year === 1970 ? M : H) : f('Original engine', 'Engine code ' + eng, U, 'Not a documented ' + year + ' engine letter.'));
    out.fields.push(MOPAR_PLANT[plant] ? f('Assembly plant', MOPAR_PLANT[plant], M) : f('Assembly plant', 'Plant code ' + plant, U, 'Not in our verified plant list.'));
    out.fields.push(f('Sequence number', seq, H, 'Plant build sequence; started at 100001 each model year.'));
    if (line === 'X' && year === 1970 && plant !== 'G') out.notes.push('Heads up: all 1970 Chargers were built in St. Louis (plant G). A different plant letter is worth investigating.');
    if (/^[JRV]$/.test(eng) && year) out.notes.push('Big-block and Hemi cars are often cloned. Match the VIN to the fender tag, the partial VIN stamped on the engine and transmission, and the documentation.');
    return out;
  }

  function decode(raw) {
    var v = clean(raw);
    var res;
    if (v.length === 17) return { input: v, error: 'This is a 17-character VIN, the standard used since the 1981 model year. If the standard decoder can’t read it, double-check each character. Pre-1981 cars almost never have 17 characters.' };
    if (v.length < 8 || v.length > 16) return { input: v, error: 'Classic serial numbers are usually 11 to 13 characters. Please check the number on the VIN plate.' };
    if (/^[1-9]\d{4}\d[A-Z0-9]\d{6}$/.test(v)) res = decodeGM65(v);
    else if (/^[1-9][A-Z]\d{2}[A-Z0-9][2-9A][A-Z0-9]\d{6}$/.test(v)) res = decodeGM72(v);
    else if (/^\d[A-Z]\d{2}[A-Z]\d{6}$/.test(v)) res = decodeFord(v);
    else if (/^[A-Z][A-Z]\d{2}[A-Z]\d[A-Z]\d{6}$/.test(v)) res = decodeMopar(v);
    else return { input: v, error: 'We couldn’t match this ' + v.length + '-character number to a documented GM (1965–80), Ford 11-character or Chrysler (1968–70) layout. Pre-1965 cars and other makes used formats we don’t decode yet. We won’t guess.' };
    res.input = v;
    return res;
  }

  /* ---------- Rendering ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var BADGE = { high: ['Documented', 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'], medium: ['Likely', 'bg-amber-500/10 border-amber-500/30 text-amber-200'], unconfirmed: ['Can’t confirm', 'bg-white/5 border-white/15 text-silver-400'] };
  function partsLinks(veh) {
    if (!veh || !veh.year || !veh.make || !veh.model) return '';
    var q = veh.year + ' ' + veh.make + ' ' + veh.model, e = encodeURIComponent(q).replace(/%20/g, '+');
    var ra = 'https://www.rockauto.com/en/catalog/' + encodeURIComponent(veh.make.toLowerCase()) + ',' + veh.year + ',' + encodeURIComponent(veh.model.toLowerCase()).replace(/%20/g, '+');
    var links = [['AutoZone', 'https://www.autozone.com/searchresult?searchText=' + e], ['Advance Auto Parts', 'https://www.advanceautoparts.com/web/SearchResults?searchTerm=' + e], ['CarParts.com', 'https://www.carparts.com/search?q=' + e], ['RockAuto', ra]];
    return '<div id="partsBox" class="glass-card metallic-border rounded-2xl p-6 mt-5 carbon-panel">' +
      '<h3 class="text-lg font-bold text-white">Parts for your ' + esc(q) + '</h3>' +
      '<p class="text-xs text-silver-500 mt-1">Search each store for parts that fit. Always confirm fitment with the store before you buy.</p>' +
      '<div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">' + links.map(function (l) { return '<a href="' + l[1] + '" target="_blank" rel="noopener" class="inline-flex justify-center items-center min-h-[44px] px-3 py-2 rounded-xl border border-white/15 hover:border-volt-500/50 text-silver-200 text-sm font-semibold text-center">' + l[0] + '</a>'; }).join('') + '</div></div>';
  }
  function render(res, host) {
    if (!host) return;
    if (res.error) {
      host.innerHTML = '<div class="glass-card metallic-border rounded-2xl p-6 carbon-panel animate-in"><h3 class="text-lg font-bold text-white">Classic VIN decoder</h3><p class="mt-2 text-sm text-silver-300 leading-relaxed">' + esc(res.error) + '</p><p class="mt-3 text-xs text-silver-500">See <a class="text-volt-400 underline" href="/classic-vin-decoder/">which classic formats we decode</a>.</p></div>';
      host.classList.remove('hidden'); return;
    }
    var rows = res.fields.map(function (x) {
      var b = BADGE[x.conf];
      return '<div class="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]"><div class="flex items-center justify-between gap-2"><div class="text-[10px] font-semibold text-silver-500 uppercase tracking-wider">' + esc(x.label) + '</div><span class="text-[10px] px-2 py-0.5 rounded-md border ' + b[1] + '">' + b[0] + '</span></div><div class="font-semibold text-white mt-1">' + esc(x.value) + '</div>' + (x.note ? '<div class="text-xs text-silver-500 mt-1 leading-snug">' + esc(x.note) + '</div>' : '') + '</div>';
    }).join('');
    var notes = res.notes.length ? '<ul class="mt-4 space-y-2 text-sm text-amber-200/90">' + res.notes.map(function (n) { return '<li class="p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">' + esc(n) + '</li>'; }).join('') + '</ul>' : '';
    host.innerHTML = '<div class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel animate-in">' +
      '<div class="steel-header px-6 py-4 flex flex-wrap items-center justify-between gap-3"><h3 class="text-lg font-bold text-white">Classic VIN decode</h3><span class="text-xs px-3 py-1.5 rounded-lg bg-volt-600/10 border border-volt-500/20 text-volt-400 font-mono tracking-wide">' + esc(res.input) + '</span></div>' +
      '<div class="px-6 py-5"><p class="text-xs text-silver-500 mb-4">Format: ' + esc(res.format) + '. <a class="text-volt-400 underline" href="/classic-vin-decoder/methodology/">How we decode &amp; sources</a></p>' +
      '<div class="grid sm:grid-cols-2 gap-3">' + rows + '</div>' + notes +
      '<p class="mt-4 text-xs text-silver-500 leading-relaxed">A classic VIN plate can be swapped or re-stamped. Before you buy, confirm it against the trim, cowl or fender tag, the title, and the partial VIN on the engine and transmission. Classic cars aren’t in NHTSA’s recall database.</p>' +
      '<div class="mt-4 flex flex-wrap gap-2"><a href="https://www.hagerty.com/valuation-tools" target="_blank" rel="noopener" class="inline-flex items-center px-4 py-2 rounded-xl border border-white/15 hover:border-volt-500/50 text-silver-200 text-sm font-semibold">Check classic values (Hagerty)</a><a href="https://vehiclehistory.bja.ojp.gov/nmvtis_vehiclehistory" target="_blank" rel="noopener" class="inline-flex items-center px-4 py-2 rounded-xl border border-white/15 hover:border-volt-500/50 text-silver-200 text-sm font-semibold">Title history (NMVTIS)</a></div>' +
      '</div></div>' + partsLinks(res.vehicle);
    host.classList.remove('hidden');
  }
  window.caClassic = { decode: decode, render: render, partsLinks: partsLinks, clean: clean };
})();
