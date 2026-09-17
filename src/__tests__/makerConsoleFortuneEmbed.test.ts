import { fortuneUpstreamUrl, rewriteFortuneHtml } from '../maker/console/fortuneEmbed';

describe('Maker console fortune embed', () => {
  it('keeps the upstream fortune URL inside the GitHub Pages site', () => {
    expect(fortuneUpstreamUrl('/gdev-fortune/', '?embed=1&theme=dungeon&mode=dark').href).toBe(
      'https://liangdong-ttm.github.io/gdev-fortune/?embed=1&theme=dungeon&mode=dark'
    );
    expect(() => fortuneUpstreamUrl('/gdev-fortune/../secret')).toThrow(
      'Invalid fortune embed path.'
    );
  });

  it('injects a same-origin size reporter into the fortune HTML', () => {
    const html = rewriteFortuneHtml('<html><body><main class="container"></main></body></html>');
    expect(html).toContain("type:'gdev-fortune:size'");
    expect(html).toContain('</script></body></html>');
  });
});
