// 完整保留原版 17 个分组、161 条节点；重复 URL 只在检测时去重。
// 名称中的“定向”等标记为历史描述，不代表运营商计费承诺或当前可用性。
export const DEFAULT_GROUPS = [
  { name: '常用推荐', items: [
    { name: '百度CDN [高速]', url: 'https://issuecdn.baidupcs.com/issue/netdisk/apk/BaiduNetdiskSetup_wap_share.apk' },
    { name: '阿里CDN', url: 'https://img.alicdn.com/imgextra/i1/O1CN01xA4P9S1JsW2WEg0e1_!!6000000001084-2-tps-2880-560.png' },
    { name: '腾讯CDN', url: 'https://wegame.gtimg.com/g.55555-r.c4663/wegame-home/sc02-03.514d7db8.png' },
    { name: 'Vivo', url: 'https://wwwstatic.vivo.com.cn/vivoportal/files/resource/funtouch/1651200648928/images/os2-jude-video.mp4' },
    { name: '咪咕视频', url: 'https://img.cmvideo.cn/publish/noms/2022/10/14/1O3VIGPVP6HTS.jpg' },
    { name: '天翼云', url: 'https://desk.ctyun.cn/desktop/software/clientsoftware/download/ff3e71dcc21152307f54700c62e5aef6' },
    { name: 'Cloudflare Speed [Global]', url: 'https://speed.cloudflare.com/__down?bytes=1073741824' },
    { name: '自定义下载·lf5-j1gamecdn-cn.dailygn.com', url: 'https://lf5-j1gamecdn-cn.dailygn.com/obj/lf-game-lf/gdl_app_2682/1233880772355.mp4' },
    { name: '自定义下载·issuepcdn.baidupcs.com', url: 'https://issuepcdn.baidupcs.com/issue/netdisk/yunguanjia/BaiduNetdisk_7.54.0.103.exe' },
    { name: '自定义下载·wppkg.baidupcs.com', url: 'https://wppkg.baidupcs.com/issue/netdisk/apk/BaiduNetdisk_10.1.02.apk' },
    { name: '自定义下载·static-d.iqiyi.com', url: 'https://static-d.iqiyi.com/ext/common/iQIYIMedia_000.dmg' },
    { name: '自定义下载·gw.alicdn.com#1', url: 'https://gw.alicdn.com/tfscom/TB1fASCxhjaK1RjSZKzXXXVwXXa.jpg' },
    { name: '自定义下载·img.alicdn.com', url: 'https://img.alicdn.com/imgextra/i1/O1CN01xA4P9S1JsW2WEg0e1_!!6000000001084-2-tps-2880-560.png' },
    { name: '自定义下载·gw.alicdn.com#2', url: 'https://gw.alicdn.com/tfs/TB1k07QUoY1gK0jSZFCXXcwqXXa-810-450.png' },
    { name: '自定义下载·cloud.video.taobao.com', url: 'https://cloud.video.taobao.com/play/u/null/p/1/e/6/t/1/442087612070.mp4' },
    { name: '自定义下载·lf9-static.bytednsdoc.com', url: 'https://lf9-static.bytednsdoc.com/obj/eden-cn/uhbfnupkbps/video/earth_v6.mp4' }
  ] },
  { name: '中国移动云盘', items: [
    { name: '中国移动云盘-静态资源1[定向]', url: 'https://yun.mcloud.139.com/mCloudPc/v832/mCloud_Setup-001.exe' }
  ] },
  { name: '移动云手机', items: [
    { name: '移动云手机-静态资源3', url: 'https://lf3-data.volccdn.com/obj/data-static/log-sdk/collect/5.0/collect-rangers-v5.1.7.js' }
  ] },
  { name: '腾讯', items: [
    { name: '微信红包-图片资源1[非定向]', url: 'https://weixinredpacket.wxqcloud.qq.com/red2022/2/14/89.jpg' },
    { name: '微信红包-图片资源2[定向]', url: 'https://mmcomm.qpic.cn/wx_redskin/8kD42ndTK262mU9603rnaaTWiafyURYcfEnu1WAs85e3iby8WtwMKCAg/' },
    { name: '微信红包-静态资源1[定向]', url: 'https://finder.video.qq.com/268/20303/stodownload?encfilekey=Cvvj5Ix3eewK0tHtibORqcsqchXNh0Gf3LU4CKFYQgrxxGTryibGG1vrVQ7KQm6iaOMLz6w9ZA0D3wfMrS3Fy9NlABwmibfeWwibcWPialfiaYvFzwncHxxYnvyfibFVrQia6o0iaQ&token=x5Y29zUxcibBlhUrxSefJ9VWyNicsB4SJeDjc3XtiaThF8nzov4A9wwfOE76Jahic840782ticOwbZibw&idx=1&bizid=1023&hy=SH&m=&scene=0' },
    { name: '微信-静态资源1[定向]', url: 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js' },
    { name: '微信-静态资源2[定向]', url: 'https://res.wx.qq.com/open/zh_CN/htmledition/res/dev/download/sdk/WeChatSDK1.7.5.zip' },
    { name: '微信-静态资源3[定向]', url: 'https://captcha.gtimg.com/1/tcaptcha-frame.28d99140.js' },
    { name: 'QQ安全中心-静态资源1', url: 'https://js.aq.qq.com/js/aq_common.js' },
    { name: '腾讯游戏-静态资源1', url: 'https://game.gtimg.cn/images/cf/cp/a20221219jansecond/t3_prop11.gif' },
    { name: '腾讯游戏-静态资源3[定向]', url: 'https://ossweb-img.qq.com/images/lol/web201310/skin/big10001.jpg' },
    { name: 'Wegame-图片资源1', url: 'https://wegame.gtimg.com/g.55555-r.c4663/wegame-home/sc02-03.514d7db8.png' },
    { name: 'Wegame-静态资源1[统计不准确]', url: 'https://cdn-go.cn/vasdev/web_webpersistance_v2/latest/flog.core.min.js' },
    { name: 'Wegame-静态资源2[统计不准确]', url: 'https://omi.cdn-go.cn/play/latest/assets/main.1840ac5c.js' },
    { name: '腾讯-静态资源[统计不准确]', url: 'https://combo.b.qq.com/c/=/crm/wpa/release/3.3.8/wpa/APIs/addCustom.js,/crm/wpa/release/3.3.8/lang/extend.js,/crm/wpa/release/3.3.8/util/domain.js,/crm/wpa/release/3.3.8/wpa/WPA.js,/crm/wpa/release/3.3.8/wpa/wpaMgr.js,/crm/wpa/release/3.3.8/lang/browser.js,/crm/wpa/release/3.3.8/util/proxy.js,/crm/wpa/release/3.3.8/util/pad.js,/crm/wpa/release/3.3.8/util/Bits.js,/crm/wpa/release/3.3.8/util/getJSONP.js,/crm/wpa/release/3.3.8/util/cookie.js,/crm/wpa/release/3.3.8/util/events.js,/crm/wpa/release/3.3.8/util/onLoad.js,/crm/wpa/release/3.3.8/util/offset.js,/crm/wpa/release/3.3.8/util/Panel.js,/crm/wpa/release/3.3.8/util/onIframeLoaded.js,/crm/wpa/release/3.3.8/util/GUID.js,/crm/wpa/release/3.3.8/wpa/getQQVersion.js,/crm/wpa/release/3.3.8/wpa/ViewHelper.js,/crm/wpa/release/3.3.8/wpa/views.js?v=3.3.8.20160126' },
    { name: '腾讯视频-静态资源1', url: 'https://iwan-s.video.qq.com/packages/game-popover/latest/bundle.js' },
    { name: '腾讯视频-静态资源2', url: 'https://vm.gtimg.cn/thumbplayer/superplayer/1.35.4/superplayer.js' },
    { name: '腾讯视频-静态资源3', url: 'https://staticfile.qq.com/qimei/qimeisdk-web/0.6.3/index.js' },
    { name: '腾讯视频-图片资源1', url: 'https://community.image.video.qpic.cn/1234_1f0e95-5_1492899934_1726140843769309' },
    { name: '腾讯视频-图片资源2', url: 'https://image.video.qpic.cn/1234_a552e-16_630898403_1622953662941360' },
    { name: '腾讯视频-图片资源3', url: 'https://media-img.puui.qpic.cn/media_img/0/15204231726208958870/0' },
    { name: '腾讯视频-图片资源4', url: 'https://vcover-hz-pic.puui.qpic.cn/vcover_hz_pic/0/mzc00200x210zrt1725330684307/0' }
  ] },
  { name: '哔哩哔哩', items: [
    { name: '哔哩哔哩-静态资源1[定向]', url: 'https://upos-sz-static.bilivideo.com/ssaxcode/m201120a222dw4bejcrhrq3gt815s4zd-1-SiteTool_1080.mp4' },
    { name: '哔哩CDN域名-阿里CDN', url: 'https://s1.hdslb.com/bfs/game-static/web/caster/static/script/vue/da3f37d7fd8339357ed671a94941757e/st.zip' },
    { name: '哔哩CDN域名-阿里CDN2', url: 'https://s3.hdslb.com/bfs/game-static/web/caster/static/script/vue/da3f37d7fd8339357ed671a94941757e/st.zip' },
    { name: '哔哩哔哩-图片资源1[定向]', url: 'https://static.hdslb.com/images/base/icons.png' }
  ] },
  { name: '百度系', items: [
    { name: '百度网盘-静态资源1', url: 'https://issuecdn.baidupcs.com/issue/netdisk/yunguanjia/BaiduYunGuanjia_6.7.4.exe' },
    { name: '百度网盘-静态资源2', url: 'https://wppkg.baidupcs.com/issue/netdisk/apk/BaiduNetdisk_10.1.02.apk' },
    { name: '百度网盘-静态资源3', url: 'https://nd-static.bdstatic.com/m-static/v20-main/home/js/chunk-vendors.f3d214b0.js' },
    { name: '百度网盘-静态资源4', url: 'https://staticiot.cdn.bcebos.com/union/badjs-sdk-min-2.0.0.js' },
    { name: '百度网盘-静态资源5', url: 'https://code.bdstatic.com/npm/spy-client@2.0.3/dist/spy-client-basic.min.js' },
    { name: '百度网盘-图片资源1', url: 'https://staticsns.cdn.bcebos.com/amis/2023-11/1701055508610/light-hello.png' },
    { name: '百度贴吧-静态资源1', url: 'https://dlswbr.baidu.com/heicha/mm/2027/acs-2027.js' },
    { name: '百度贴吧-静态资源2', url: 'https://efe-h2.cdn.bcebos.com/cliresource/@baidu/ubc-report-sdk/3.3.3/ubc-report-sdk.iife.polyfill.min.js' },
    { name: '百度贴吧-静态资源3', url: 'https://dmpstatic.cdn.bcebos.com/weirwood-sdk/1/1.3.7/bundle.min.js' },
    { name: '百度贴吧-静态资源3#2', url: 'https://tb5.bdstatic.com/api/wza/aria.js' },
    { name: '百度贴吧-图片资源1', url: 'https://tieba-ares.cdn.bcebos.com/mis/2022-5/1653034037345/186363ee83e9.png' },
    { name: '百度贴吧-图片资源2', url: 'https://imgsa.baidu.com/forum/pic/item/1e41a7014a90f603a3e0dea13412b31bb251edcc.jpg' },
    { name: '百度视频-静态资源1', url: 'https://jmy-video.baidu.com/7b828dab3003f3841f3a026b437cf879_1280_720.mp4' },
    { name: '百度视频-图片资源1', url: 'https://avatar.bdstatic.com/it/u=3525109608,2713994146&fm=3012' },
    { name: '百度视频-图片资源2', url: 'https://pic.rmb.bdstatic.com/baidu-rmb-video-cover-1/2024-1/1705996556941/724684ad74c9.png' },
    { name: '百度页游-静态资源1', url: 'https://fenwan.cdn.bcebos.com/webgame/static/webgame/js/index.aea21658.js' },
    { name: '百度文库-静态资源2', url: 'https://wkstatic.bdimg.com/static/ndpcwenku/static/pcCoreClient/js/views/1b65f79a0217ad721cce.js' }
  ] },
  { name: '爱奇艺', items: [
    { name: '爱奇艺-静态资源1', url: 'https://stc.iqiyipic.com/gaze/fingerprint/1.0.58/fingerprint.umd.min.js' },
    { name: '爱奇艺-静态资源2', url: 'https://static.iqiyi.com/js/player_v3/pcweb.wonder.12.92.online.js' },
    { name: '爱奇艺-静态资源3', url: 'https://static-s.iqiyi.com/qysdk/payment/static/js/main.js' },
    { name: '爱奇艺-静态资源4', url: 'https://www.iqiyi.com/static/2024913091751/css/main.css' },
    { name: '爱奇艺-静态资源5', url: 'https://security.iqiyi.com/static/cook/v1/cooksdk.js' },
    { name: '爱奇艺-图片资源5', url: 'https://static.g.iqiyi.com/qiplay2/e1339c7c-1cfc-458a-b165-62ec14e59f19.png' }
  ] },
  { name: '阿里系', items: [
    { name: '阿里云-图片资源1', url: 'https://img.alicdn.com/imgextra/i1/O1CN01xA4P9S1JsW2WEg0e1_!!6000000001084-2-tps-2880-560.png' },
    { name: '阿里云-图片资源2', url: 'https://gw.alicdn.com/tfscom/TB1fASCxhjaK1RjSZKzXXXVwXXa.jpg' },
    { name: '阿里云-静态资源1', url: 'https://g.alicdn.com/AWSC/fireyejs/1.228.23/fireyejs.js' },
    { name: '淘宝-静态资源2', url: 'https://o.alicdn.com/tbhome/tbnav/index.js' },
    { name: '淘宝-静态资源3', url: 'https://at.alicdn.com/t/a/font_403341_6q1chd11nes.woff2' },
    { name: '支付宝-静态资源1', url: 'https://mdn.alipayobjects.com/ind_developertool/afts/file/A*fSAmSbgxLosAAAAAAAAAAAAADlx-AQ?af_fileName=AlipayKeyTool-2.0.3.dmg' },
    { name: '支付宝-静态资源2', url: 'https://gw.alipayobjects.com/render/p/yuyan/180020010001210191/umi.9f3e4149.js' },
    { name: '支付宝-静态资源3', url: 'https://ur.alipay.com/tracert_a1911.js' }
  ] },
  { name: '中国联通', items: [
    { name: '联通官网-图片资源2(中国联通)', url: 'https://www.10010.com/wt_service_web/copyright/images/jifenshangcheng.png' },
    { name: '联通官网-图片资源3(中国联通)', url: 'https://iservice.10010.com/wt_manage/uploadImg/1730297793913.png' },
    { name: '联通官网-静态资源1(中国联通)', url: 'https://www.10010.com/wt_service_web/js/header.js' }
  ] },
  { name: '中国电信', items: [
    { name: '电信官网-静态资源1(中国电信)', url: 'https://bigdata-behaviordata.189.cn:9002/chinatelecom/chinatelecom.min.js' },
    { name: '天翼云(中国电信)', url: 'https://vod-origin-rjzy.gdoss.xstore.ctyun.cn/f9ea5388dc0447aa88a5b92f07f1a8f7.mp4' },
    { name: '天翼云会议-静态资源1(中国电信)', url: 'https://cloudmeeting.189.cn/static/js/chunk-vendors.624b9116.js' },
    { name: '天翼云盘-静态资源1(中国电信)', url: 'https://static.e.189.cn/open/login/page/web/v5.0/static/js/captch.min.js?v1.1' },
    { name: '优酷-图片资源1', url: 'https://m.ykimg.com/0584000066BEC16C13EB661302C6D644' },
    { name: '优酷-图片资源2', url: 'https://liangcang-material.alicdn.com/prod/upload/b4cef471dbfb452fbff8a61102a8ca9a.webp.gif' },
    { name: '优酷-图片资源3', url: 'https://static.youku.com/user/avatar/1350/23.png' },
    { name: '华为官网-图片资源1', url: 'https://consumer.huawei.com/content/dam/huawei-cbg-site/cn/mkt/huawei-cloud-service/appgallery/application-boutique-pc1.jpg' },
    { name: '华为云-静态资源1', url: 'https://res.hc-cdn.com/cnpm-baseui/2.8.11/fonts/HuaweiSans-Bold.ttf' },
    { name: '华为云-图片资源1', url: 'https://res-static.hc-cdn.cn/cloudbu-site/china/zh-cn/HWCdeveloper/shemei/bilibili-qc.jpg' },
    { name: '华为云-静态资源2', url: 'https://portal.hc-cdn.com/cnpm-baseui/2.8.11/index.css' },
    { name: '小米开放平台-静态资源1', url: 'https://dev.mi.com/console/css/main.css' },
    { name: '小米开放平台-静态资源2', url: 'https://cdn.cnbj1.fds.api.mi-img.com/appstore-developer-web-fe/production/static/js/14.45dbc296.chunk.js' },
    { name: '小米开放平台-静态资源3', url: 'https://cdn.web-global.fds.api.mi-img.com/mcfe--mi-account/static/static/media/banner.92c693b4..jpg' },
    { name: '小米开放平台-静态资源4', url: 'https://mcfe--account-static-legacy.cnbj1.mi-fds.com/mcfe--account-static-legacy/static/prod/captcha-static/v2/js/v.js' },
    { name: '小米开放平台-静态资源5', url: 'https://static-verify.sec.xiaomi.com/v2/js/v.js' },
    { name: '京东商城-静态资源1', url: 'https://wq.360buyimg.com/jdm-home-page/pages/js/index.aeba0df4.js' },
    { name: '京东商城-静态资源2', url: 'https://storage.360buyimg.com/babelnode/jd-jssdk/4.2.1/jd-jssdk.js' },
    { name: '京东商城-静态资源4', url: 'https://storage.jd.com/jdmobile/JDMALL-PC2.apk' },
    { name: '京东商城-图片资源1', url: 'https://m.360buyimg.com/seckillcms/jfs/t1/155683/19/46720/143938/66de6069Fcbca5419/a04efd5dd680737d.png' },
    { name: '拼多多-静态资源1', url: 'https://static.pddpic.com/assets/js/react_pdd_50c6d8bdb252d256ae20_1026.js' },
    { name: '拼多多-静态资源2', url: 'https://mcdn.pinduoduo.com/home/js/index.494d9edf.js' },
    { name: '拼多多-静态资源3', url: 'https://lpcdn.pinduoduo.com/_next/static/chunks/74769-4e08eb3c27153a5f.js' },
    { name: '拼多多-静态资源5', url: 'https://cd.pddpic.com/android_dev/2023-07-28/5c04772968aee57ca690fbe1e7f29467.apk' },
    { name: '拼多多-图片资源1', url: 'https://funimg.pddpic.com/common/recruit/43c56034-ce04-49fc-9227-0d24a8e82849.png' },
    { name: '拼多多-图片资源2', url: 'https://img.pddpic.com/gaudit-image/2024-06-01/3c2541af53af076d0b78c67fd51db13d.jpeg' },
    { name: '拼多多-图片资源3', url: 'https://cdn.pinduoduo.com/upload/official_website/6b1f700d-70c7-4f9f-890c-eb9f9ae68425.png' },
    { name: '拼多多-图片资源4', url: 'https://commimg.pddpic.com/add-crystal-outer/2023-04-11/70a3dea1-53d4-4da6-9397-d4bf2a884911.gif.slim.gif' },
    { name: '逆水寒官网静态资源', url: 'https://n.v.netease.com/2018/1017/ba32725ee3a20ee1fbe874a45d1f7fa9qt.mp4' },
    { name: 'MCLauncher工具(阿里CDN)', url: 'https://x19.gdl.netease.com/MCLauncherTool_0.1.4.50447.exe' },
    { name: '网易公开课(白云山CDN)', url: 'https://mov.bn.netease.com/movieMP4/2011/3/U/1/S6V22L0U1.mp4' }
  ] },
  { name: '咪咕系列', items: [
    { name: '咪咕音乐-静态资源1', url: 'https://wsdkdl.migu.cn/common/mgmusic/migu_https.js' },
    { name: '咪咕音乐-静态资源2[统计不准确]', url: 'https://webpay.migu.cn:8443/migunetsdk/webJs/frame.html?netId=b486900f41fc411187240dcb45fdbc8d&client=WWW&umark=Common2&protocol=https&mv=3.0.1&t=1704113156924' },
    { name: '咪咕视频-图片资源1', url: 'https://img.cmvideo.cn/publish/noms/2022/10/14/1O3VIGPVP6HTS.jpg' },
    { name: '咪咕视频-图片资源2', url: 'https://wapx.cmvideo.cn/publish/poms/image/1752/094/251/202311151425_477841_HSJ1080H.jpg' },
    { name: '咪咕快游-图片资源1(中国移动)[非定向]', url: 'https://wcache.migu.cn/prod/upload/game_resource/contentRelated/006212638000/84/1662605671282.jpg' },
    { name: '咪咕快游-图片资源2(中国移动)[非定向]', url: 'https://static.migucloud.com/article/462/20191213/4f23d49723e5a46938718a3f4587734f.png' },
    { name: '咪咕快游-图片资源3(中国移动)[非定向]', url: 'https://scache.cmam.migu.cn/nuwa/culture/202309/20230905/model/m9100013009198/f1164326392847015936.png?timestamp=2332214977783&sid=2445210582&encrypt=936ee89150a3158eb577614473f425e5' },
    { name: '咪咕快游-图片资源4(中国移动)[非定向]', url: 'https://freeserver.migufun.com/resource/beta/picture/system/20211003/20211003124601120_28.jpg' },
    { name: '咪咕快游-图片资源5(中国移动)', url: 'https://gcache.migu.cn/prod/upload/game_resource/channel_for_homepage_game2/202408/2909/59/20240829095855985_mgwebp1.jpg' },
    { name: '咪咕快游-静态资源1(中国移动)[非定向]', url: 'https://h5cdn.migufun.com/middleh5/_nuxt/9d04212.js' },
    { name: '中国移动商城-图片资源1', url: 'https://img1.shop.10086.cn/goods/ts27zarfe8d5jgvs_940x7200' },
    { name: '中国移动业务-图片资源2', url: 'https://res.app.coc.10086.cn/group1/M00/03/0D/CtFOBmTxRyaAYjdGAAAhPGgdCJw206.png' }
  ] },
  { name: '移动云', items: [
    { name: '移动云-静态资源2', url: 'https://ecloud.eos-guangzhou-1.cmecloud.cn/op-login-static/3.6.0/js/vendor.6a12e122d36e1092fd0e.js' },
    { name: '知乎-图片资源', url: 'https://picx.zhimg.com/v2-af7215f2d8266fec068e049b7559cd19.gif' },
    { name: '知乎-静态资源', url: 'https://static.zhihu.com/parker/campaign/vendors.5b2b99d85429920d2342.js' },
    { name: 'OPPP商城静态资源', url: 'https://dsfs.oppo.com/oppo/shop-pc-v2/main/js/9fb472f.js' },
    { name: 'VIVO官网静态资源', url: 'https://wwwstatic.vivo.com.cn/vivoportal/files/resource/funtouch/1651200648928/images/os2-jude-video.mp4' },
    { name: 'VIVO应用商店', url: 'https://imgwsdl.vivo.com.cn/appstore/developer/soft/20210125/202101251051528awqa.apk' },
    { name: '上海灵羊1', url: 'https://activity.hdslb.com/blackboard/static/20210604/4d40bc4f98f94fbc71c235832ce3efd4/hJEhL6jGOY.zip' },
    { name: '搜狐视频', url: 'https://photocdn.tv.sohu.com/img/20230419/pic_org_88f470db-176e-40c5-a514-a31993dabb27.jpg' },
    { name: '搜狐图片', url: 'https://p8.itc.cn/c_fit,w_1800,h_1200,q_100/images01/20230723/e23a27186e404472ab1f659a1ae18cae.jpeg' },
    { name: '新浪', url: 'https://i.apps.sina.cn/tqt/zip/com.sina.tianqitong_6.1892_2019.07.29.17.54.18.apk' },
    { name: '斗鱼CDN', url: 'https://sta-op.douyucdn.cn/dyadmin-ext/pkg/pc/DY_OBS_Studio_Ext/20221208103446325/DYOBSStudioExtension_1.0.2.3.exe' },
    { name: '斗鱼CDN-小文件', url: 'https://shark2.douyucdn.cn/front-publish/live-master/lib/vendor-room_4e3a873.js' },
    { name: '七牛云', url: 'https://devtools.qiniu.com/linux/amd64/qrsctl' },
    { name: 'Quark_Browser(uc)', url: 'https://image.uc.cn/s/uae/g/2i/uninstallpg/Quark%20Browser.apk' },
    { name: 'Vultr 1G(新加坡)', url: 'https://sgp-ping.vultr.com/vultr.com.1000MB.bin' },
    { name: 'Vultr 1G(纽约)', url: 'https://nj-us-ping.vultr.com/vultr.com.1000MB.bin' },
    { name: 'Vultr 1G(日本)', url: 'https://hnd-jp-ping.vultr.com/vultr.com.100MB.bin' },
    { name: 'Vultr 1G(德国)', url: 'https://fra-de-ping.vultr.com/vultr.com.100MB.bin' },
    { name: 'Vultr 1G(美国洛杉矶)', url: 'https://lax-ca-us-ping.vultr.com/vultr.com.100MB.bin' },
    { name: 'Vultr 1G(美国2)', url: 'https://nj-us-ping.vultr.com/vultr.com.100MB.bin' }
  ] },
  { name: 'Github', items: [
    { name: 'Github-静态资源1', url: 'https://github.githubassets.com/assets/optimizely-f41bb566674d.js' },
    { name: 'Github-静态资源2', url: 'https://github.githubassets.com/assets/cat-7c075cc3dda1.glb' },
    { name: 'Github-图片资源1', url: 'https://github.githubassets.com/images/mona-whisper.gif' },
    { name: 'Github-图片资源2', url: 'https://github.githubassets.com/assets/head_sss-adeeeaf1228e.jpg' }
  ] },
  { name: 'Apple', items: [
    { name: 'apple-静态资源1', url: 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js' },
    { name: 'apple-静态资源2', url: 'https://js-cdn.music.apple.com/musickit/v2/amp/musickit.js' },
    { name: 'apple-静态资源3', url: 'https://js-cdn.music.apple.com/hls.js/2.610.3/hls.js/hls.js' },
    { name: 'apple-静态资源4', url: 'https://apptrailers.itunes.apple.com/itunes-assets/PurpleVideo221/v4/e5/b8/e1/e5b8e119-58bf-0a47-45d3-28519a8bfdf4/P850599853_Anull_video_gr290_sdr_886x1920-.mp4' },
    { name: 'apple-图片资源1', url: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/60/60/23/606023fb-33d6-79e8-bcfe-7793257abd65/3_iOS_6.7.jpg/230x0w.webp' }
  ] },
  { name: 'Google', items: [
    { name: 'Google-静态资源1', url: 'https://fonts.gstatic.com/s/roboto/v47/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3yUBA.woff2' },
    { name: 'Google-静态资源2', url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=YouTube+Sans:wght@300..900&display=swap' }
  ] },
  { name: 'Cloudflare', items: [
    { name: 'Cloudflare-静态资源1', url: 'https://challenges.cloudflare.com/turnstile/v0/g/ec4b873d446c/api.js' }
  ] },
  { name: '广告', items: [
    { name: '书旗小说-图片广告01', url: 'https://p2-lm.adukwai.com/udata/pkg/aW1hZ2UtcGtnOmFkX2RzcF9pbWFnZV91cGxvYWQ6Mzc4NDA0NTU0NzpNRVJDSEFOVDpbQkA2NjE0ZWI3MDoxMDY2MjcyNzk1MzU0Nw==.jpg' },
    { name: '书旗小说-图片广告02', url: 'https://sf3-fe-tos.pglstatp-toutiao.com/obj/ad-pattern/static/images/1700635544820_splashbackfor5.jpg' },
    { name: '书旗小说-图片广告03', url: 'https://img.meituan.net/content/f56fe3456d25d951cdd32efa56d608a290831.jpg' },
    { name: '书旗小说-图片广告04', url: 'https://p0.meituan.net/content/367fc11bb0ef629cb72988bfc5c9a930267166.jpg' },
    { name: '书旗小说-图片广告05', url: 'https://p1.meituan.net/linglong/2a7ff2c8b1928507c721c577762b8321285561.jpg' },
    { name: '书旗小说-图片广告06', url: 'https://sf3-fe-tos.pglstatp-toutiao.com/obj/ad-pattern/static/images/1701689556172_swipe-up.gif' },
    { name: '书旗小说-图片广告07', url: 'https://s3plus.meituan.net/v1/mss_5017c592a8a946d2a54eb62a76ba299c/nebulafile/e73d23a1d2929534c167ad61c75b8aae' },
    { name: '书旗小说-图片广告08', url: 'https://pgdt.ugdtimg.com/141/20204/snscosdownload/SZ/reserved/689059e200078a5908be7c8d71f701150000008d00004eec' },
    { name: '书旗小说-图片广告09', url: 'https://cdn.1rtb.com/s1000/jd.jpg' },
    { name: '书旗小说-图片广告10', url: 'https://p2-lm.adukwai.com/udata/pkg/aW1hZ2UtcGtnOmFkX2RzcF9pbWFnZV91cGxvYWQ6Mzc4NDA0NTU0NzpNRVJDSEFOVDpbQkA0OWQ1OTQ3Mjo0ODkyOTI5MzA3NTQ3.jpg' }
  ] }
];
