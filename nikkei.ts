import { DOMParser, Element } from '@b-fuze/deno-dom';

type Entry = {
  time: string;
  stockCode: string;
  companyName: string;
  title: string;
  pageUrl: string;
  fileUrl: string | undefined;
};

type Disclosure = {
  latestEntryTime: number;
  entries: Entry[];
};

const NIKKEI_BASE_URL = 'https://www.nikkei.com';

const getTime = (tr: Element) => {
  const tdTime = tr.querySelector('td:nth-of-type(1)');
  return tdTime ? tdTime.textContent.trim() : '';
};

const getNameAndCode = (tr: Element) => {
  const aName = tr.querySelector('td:nth-of-type(2) > a');
  const getCode = (href: string | null) => {
    const matched = href && href.match(/scode=(\w+)$/);
    return matched ? matched[1] : '';
  };
  return aName ? [aName.textContent.trim(), getCode(aName.getAttribute('href'))] : ['', ''];
};

const getCategory = (tr: Element) => {
  const tdCategory = tr.querySelector('td:nth-of-type(3)');
  return tdCategory ? tdCategory.textContent.trim() : '';
};

const getTitleAndUrl = (tr: Element) => {
  const aTitle = tr.querySelector('td:nth-of-type(4) > a');
  const getUrl = (href: string | null) => {
    const params = href && new URL(href).searchParams;
    return params && params.has('t') ? params.get('t')! : '';
  };
  return aTitle ? [aTitle.textContent.trim(), getUrl(aTitle.getAttribute('href'))] : ['', ''];
};

const getNumYmd = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

const getNumHm = (tr: Element) => parseInt(getTime(tr).replace(':', ''), 10);

const getSlashYmd = (d: Date) => {
  const strYmd = String(getNumYmd(d));
  return `${strYmd.slice(0, 4)}/${strYmd.slice(4, 6)}/${strYmd.slice(6)}`;
};

const toEntry = async (tr: Element) => {
  const [name, code] = getNameAndCode(tr);
  const [title, pageUrl] = getTitleAndUrl(tr);
  const entry: Entry = {
    time: `${getSlashYmd(new Date())} ${getTime(tr)}`,
    stockCode: code,
    companyName: name,
    title,
    pageUrl,
    fileUrl: undefined,
  };
  const res = await fetch(pageUrl, {
    signal: AbortSignal.timeout(15000),
  });
  if (res.ok) {
    const matched = /pdfLocation.+?(\/.+\.pdf)/.exec(await res.text());
    if (matched) {
      entry.fileUrl = NIKKEI_BASE_URL + matched[1];
    }
  }
  return entry;
};

const searchDisclosure = async (lastTime: number, searchCond: RegExp): Promise<Disclosure> => {
  const lastYmd = Math.floor(lastTime / 10000), lastHm = lastTime % 10000;
  const today = getNumYmd(new Date());
  const isNewEntry = (tr: Element) => lastYmd < today || lastHm < getNumHm(tr);
  const disclosure: Disclosure = {
    latestEntryTime: 0,
    entries: [],
  };
  let page = 1;
  try {
    while (true) {
      const res = await fetch(`${NIKKEI_BASE_URL}/markets/kigyo/disclose/?SelDateDiff=0&hm=${page}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return disclosure;
      }
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const rows = Array.from(doc.querySelectorAll('#IR1600 > tbody > tr'));
      if (rows.length < 1) {
        return disclosure;
      }
      if (page === 1) {
        disclosure.latestEntryTime = today * 10000 + getNumHm(rows[0]);
      }
      const matchedEntries = await Promise.all(
        rows.filter((row) => {
          if (!isNewEntry(row)) {
            return false;
          }
          const category = getCategory(row);
          const title = getTitleAndUrl(row)[0];
          return category.includes('PR') && searchCond.test(title);
        }).map(toEntry),
      );
      disclosure.entries.push(...matchedEntries);
      if (!isNewEntry(rows.at(-1)!)) {
        return disclosure;
      }
      if (!doc.querySelector('div.searchResolutTop li.nextPageLink > a')) {
        return disclosure;
      }
      page++;
    }
  } catch (err) {
    console.error(err);
    return disclosure;
  }
};

export { searchDisclosure };
