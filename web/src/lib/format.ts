/** A share as a whole percent, rounded as the paper's Python does: to 3 decimals, then half to even (0.925 -> 92 %). */
export function pct(v: number) {
  const pm = Math.round(v * 1000), q = Math.floor(pm / 10), r = pm % 10;
  return `${r > 5 || (r === 5 && q % 2) ? q + 1 : q} %`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 2023-09-17 -> 17 Sep 2023 */
export const day = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
