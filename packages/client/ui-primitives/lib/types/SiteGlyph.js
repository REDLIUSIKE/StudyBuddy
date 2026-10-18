import { jsx as _jsx } from "react/jsx-runtime";
import { siAliexpress, siApple, siBaidu, siBilibili, siCsdn, siDuckduckgo, siEbay, siFacebook, siGithub, siGitlab, siGoogle, siInstagram, siJuejin, siMdnwebdocs, siNetflix, siNpm, siPypi, siQq, siQuora, siReddit, siSinaweibo, siSpotify, siStackoverflow, siTaobao, siTelegram, siTiktok, siV2ex, siWechat, siWhatsapp, siWikipedia, siX, siYcombinator, siYoutube, siZhihu, } from 'simple-icons';
/**
 * Host suffix to site mark, covering the developer sites the transcript
 * usually cites plus the mainstream search, video, social, shopping, and
 * reference sites a general audience links. A host matches a suffix when it
 * equals it or is a subdomain of it, and the longest matching suffix wins, so
 * `weixin.qq.com` keeps WeChat while `qq.com` keeps QQ and `gist.github.com`
 * needs no entry of its own.
 */
const SITE_HOSTS = {
    'github.com': siGithub,
    'github.io': siGithub,
    'raw.githubusercontent.com': siGithub,
    'gitlab.com': siGitlab,
    'npmjs.com': siNpm,
    'pypi.org': siPypi,
    'stackoverflow.com': siStackoverflow,
    'developer.mozilla.org': siMdnwebdocs,
    'wikipedia.org': siWikipedia,
    'news.ycombinator.com': siYcombinator,
    'youtube.com': siYoutube,
    'youtu.be': siYoutube,
    'x.com': siX,
    'twitter.com': siX,
    'bilibili.com': siBilibili,
    'zhihu.com': siZhihu,
    'juejin.cn': siJuejin,
    'csdn.net': siCsdn,
    'google.com': siGoogle,
    'baidu.com': siBaidu,
    'duckduckgo.com': siDuckduckgo,
    'tiktok.com': siTiktok,
    'netflix.com': siNetflix,
    'spotify.com': siSpotify,
    'facebook.com': siFacebook,
    'instagram.com': siInstagram,
    'reddit.com': siReddit,
    'telegram.org': siTelegram,
    't.me': siTelegram,
    'weixin.qq.com': siWechat,
    'qq.com': siQq,
    'whatsapp.com': siWhatsapp,
    'wa.me': siWhatsapp,
    'weibo.com': siSinaweibo,
    'taobao.com': siTaobao,
    'aliexpress.com': siAliexpress,
    'ebay.com': siEbay,
    'quora.com': siQuora,
    'v2ex.com': siV2ex,
    'apple.com': siApple,
};
/**
 * Resolve the mark named by an external destination.
 * @param href - The link destination; only an absolute http(s) URL can name a host.
 * @returns The matched site mark, or undefined when the host is unknown or not http(s).
 */
function siteIcon(href) {
    let host;
    try {
        const url = new URL(href);
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            return undefined;
        host = url.hostname.toLowerCase();
    }
    catch {
        // Not an absolute URL: nothing here can name a host.
        return undefined;
    }
    let match;
    let matched = 0;
    for (const [suffix, icon] of Object.entries(SITE_HOSTS)) {
        if ((host === suffix || host.endsWith(`.${suffix}`)) && suffix.length > matched) {
            match = icon;
            matched = suffix.length;
        }
    }
    return match;
}
/**
 * Render the site mark for a known external destination.
 * @param props - The destination and the icon sizing seat.
 * @returns The site's mark riding currentColor, or undefined for an unknown site.
 */
export function siteGlyph({ href, size, className }) {
    const icon = href === undefined ? undefined : siteIcon(href);
    if (icon === undefined)
        return undefined;
    return (_jsx("svg", { width: size, height: size, className: className, viewBox: "-2 -2 28 28", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": true, children: _jsx("path", { d: icon.path, fill: "currentColor" }) }));
}
//# sourceMappingURL=SiteGlyph.js.map