// Quarter arithmetic. life.clock.index = quarters elapsed since birth (0 = birth quarter).
// birth_quarter is 0..3 (Q1..Q4). The birth quarter is a provisional draw, recorded as such.

export const absQuarter = (clock, idx = clock.index) => clock.birth_year * 4 + clock.birth_quarter + idx;
export const yearOf = (clock, idx = clock.index) => Math.floor(absQuarter(clock, idx) / 4);
export const quarterOf = (clock, idx = clock.index) => absQuarter(clock, idx) % 4; // 0..3
export const ageOf = (idx) => Math.floor(idx / 4);
/** A person's age in whole years at protagonist-clock index idx. Persons store born_idx (negative if older). */
export const personAge = (person, idx) => Math.floor((idx - person.born_idx) / 4);
export const quarterLabel = (clock, idx = clock.index) => `${yearOf(clock, idx)}年 第${quarterOf(clock, idx) + 1}四半期`;
