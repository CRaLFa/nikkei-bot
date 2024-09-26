import { DOMParser, Element } from '@b-fuze/deno-dom';

type Entry = {
  time: string;
  stockCode: string;
  companyName: string;
  title: string;
  url: string;
};

type Disclosure = {
  latestEntryTime: number;
  entries: Entry[];
};

const NIKKEI_BASE_URL = 'https://www.nikkei.com';

const getTime = (tr: Element) => {
  const tdTime = tr.querySelector('td.kjTime');
  return tdTime ? tdTime.textContent.trim() : '';
};

const getCode = (tr: Element) => {
  const tdCode = tr.querySelector('td.kjCode');
  return tdCode ? tdCode.textContent.trim().slice(0, 4) : '';
};

const getName = (tr: Element) => {
  const tdName = tr.querySelector('td.kjName');
  return tdName ? tdName.textContent.trim().replace(/^[Ａ-Ｚ]－/, '') : '';
};

const getTitleAndUrl = (tr: Element) => {
  const aTitle = tr.querySelector('td.kjTitle > a');
  return aTitle ? [aTitle.textContent.trim(), aTitle.getAttribute('href') ?? ''] : ['', ''];
};

const getNumYmd = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

const getNumHm = (tr: Element) => parseInt(getTime(tr).replace(':', ''), 10);

const getSlashYmd = (d: Date) => {
  const strYmd = String(getNumYmd(d));
  return `${strYmd.slice(0, 4)}/${strYmd.slice(4, 6)}/${strYmd.slice(6)}`;
};

const toEntry = (tr: Element) => {
  const [title, url] = getTitleAndUrl(tr);
  return <Entry> {
    time: `${getSlashYmd(new Date())} ${getTime(tr)}`,
    stockCode: getCode(tr),
    companyName: getName(tr),
    title,
    url: `${NIKKEI_BASE_URL}/${url}`,
  };
};

const searchDisclosure = async (lastTime: number, searchWords: string[]): Promise<Disclosure> => {
  const lastYmd = Math.floor(lastTime / 10000), lastHm = lastTime % 10000;
  const today = getNumYmd(new Date());
  const isNewEntry = (tr: Element) => lastYmd < today || lastHm < getNumHm(tr);
  const disclosure: Disclosure = {
    latestEntryTime: 0,
    entries: [],
  };
  let page = 0;
  try {
    while (true) {
      page++;
      const res = await fetch(`${NIKKEI_BASE_URL}/I_list_${String(page).padStart(3, '0')}_${today}.html`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return disclosure;
      }
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const rows = Array.from(doc.querySelectorAll('#main-list-table tr'));
      if (rows.length < 1) {
        return disclosure;
      }
      if (page === 1) {
        disclosure.latestEntryTime = today * 10000 + getNumHm(rows[0]);
      }
      const matchedEntries = rows.filter((row) => {
        if (!isNewEntry(row)) {
          return false;
        }
        const title = getTitleAndUrl(row)[0];
        return title.match(new RegExp(searchWords.join('|')));
      }).map(toEntry);
      disclosure.entries.push(...matchedEntries);
      if (!isNewEntry(rows.at(-1)!)) {
        return disclosure;
      }
    }
  } catch (err) {
    console.error(err);
    return disclosure;
  }
};

export { searchDisclosure };
