import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

describe('mobile workflow contract', () => {
  it('offers the complete photo correction toolset on the original image', () => {
    for (const id of ['photoModeCorners', 'photoModeMove', 'photoModeAdd', 'photoModeDelete', 'photoModeCue', 'photoRedetect']) {
      assert.match(html, new RegExp(`id=["']${id}["']`));
    }
    assert.match(html, /选择所有合法目标/);
  });

  it('does not present an internal heuristic signal as an accuracy percentage', () => {
    assert.doesNotMatch(html, /可信度\s*\$?\{|可信度\s*\d*%/);
    assert.match(html, /不是统计准确率/);
  });

  it('keeps the donation panel collapsed until the user opens it', () => {
    assert.match(html, /<details[^>]+class=["'][^"']*support-footer/);
    assert.doesNotMatch(html, /<details[^>]+class=["'][^"']*support-footer[^>]+open/);
  });

  it('loads the photo-session, route-advisor and scene persistence modules', () => {
    assert.match(html, /from ['"]\.\/photo-session\.mjs['"]/);
    assert.match(html, /from ['"]\.\/route-advisor\.mjs['"]/);
    assert.match(html, /from ['"]\.\/scene-state\.mjs['"]/);
  });
});
