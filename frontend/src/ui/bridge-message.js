const URL_RE = /https?:\/\/[^\s<>]+/i;

export function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function linkFromText(text) {
  const raw = String(text || '');
  const match = raw.match(URL_RE);
  if (!match) return { text: raw, link: null };
  const url = match[0].replace(/[),。！？、.]+$/, '');
  const rest = raw.replace(match[0], '').trim();
  return {
    text: rest,
    link: { url, title: hostnameOf(url), summary: url, image: '' },
  };
}

export function imageSrc(image) {
  if (!image) return '';
  if (typeof image === 'string') {
    if (/^(https?:|data:|blob:|\/)/.test(image)) return image;
    return '';
  }
  if (typeof image.url === 'string') return imageSrc(image.url);
  return '';
}

export function imageOf(record) {
  if (!record || record.type === 'link') return '';
  const direct = imageSrc(record.image);
  if (direct) return direct;
  if (Array.isArray(record.images)) {
    const first = imageSrc(record.images[0]);
    if (first) return first;
  }
  const attachment = record.attachment;
  if (attachment && attachment.type !== 'link') return imageSrc(attachment.url || attachment);
  return '';
}

export function linkOf(record) {
  if (record?.link?.url) {
    return {
      url: record.link.url,
      title: record.link.title || hostnameOf(record.link.url),
      summary: record.link.summary || record.link.url,
      image: record.link.image || '',
    };
  }
  if (record?.type === 'link' && record.url) {
    return {
      url: record.url,
      title: record.title || hostnameOf(record.url),
      summary: record.summary || record.url,
      image: '',
    };
  }
  if (record?.type === 'image') return null;
  return linkFromText(record?.text).link;
}

export function textOf(record) {
  if (record?.type === 'image') return String(record.text || '').trim();
  if (record?.link?.url || record?.type === 'link') return String(record.text || '').trim();
  return linkFromText(record?.text).text;
}
