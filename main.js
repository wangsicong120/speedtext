// 使用局部闭包或ES模块，避免污染全局命名空间
(function() {
    // 状态配置
    let maxThreads = 4;
    let testUrl = '';
    let lastDate = 0;
    let allDownSum = 0;
    let isRunning = false;
    let isVisible = true;
    let threadDown = [];
    let lastAllDown = 0;
    let startTime = 0;

    let nowSpeed = 0;
    let nowLocalPing = 0;
    let nowGlobalPing = 0;

    // 格式化输出函数 (保持与您外部定义的 show 兼容，如果没有请自行补充或参考下方)
    // 假设外部存在 show(value, units, precisions) 
    
    /**
     * 单个下载线程的核心逻辑
     */
    async function startThread(index) {
        // 使用循环代替递归，更加安全高效
        while (isRunning) {
            try {
                const controller = new AbortController(); // 引入终止控制器，便于随手取消请求
                if (!isRunning) break;

                const response = await fetch(testUrl, { 
                    cache: "no-store", 
                    mode: 'cors', 
                    referrerPolicy: 'no-referrer',
                    signal: controller.signal
                });
                
                const reader = response.body.getReader();
                
                while (isRunning) {
                    const { value, done } = await reader.read();
                    if (done) {
                        try { await reader.cancel(); } catch(e){}
                        break; // 正常读完，跳出内层循环，进入下一次 fetch
                    }
                    if (!isRunning) {
                        try { await reader.cancel(); } catch(e){}
                        controller.abort();
                        break;
                    }
                    if (value) {
                        threadDown[index] += value.length;
                    }
                }
            } catch (err) {
                console.error(`线程 [${index}] 发生错误:`, err);
                // 发生错误时稍作停顿，避免请求失败时死循环瞬间刷爆浏览器导致卡死
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    /**
     * 计算并输出实时速度
     */
    function calculateSpeed() {
        if (!isRunning) {
            const now = Date.now();
            const totalDownloaded = sum(threadDown);
            const avgSpeed = (totalDownloaded * 1000) / (now - startTime);

            document.title = '流量消耗器';
            nowSpeed = 0;
            
            document.getElementById("speed").innerText = show(avgSpeed, ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s', 'PB/s'], [0, 0, 1, 2, 2, 2]);
            document.getElementById("mbps").innerText = show(avgSpeed * 8, ['Bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps'], [0, 0, 0, 2, 2, 2]);
            lastAllDown = 0;
            document.getElementById('describe').innerText = '平均速度';
            return;
        }

        const now = Date.now();
        const allDownActive = sum(threadDown);
        const timeDiff = now - lastDate;

        if (timeDiff > 0) {
            const currentPeriodBytes = allDownActive - lastAllDown;
            nowSpeed = (currentPeriodBytes / timeDiff) * 1000 / 1024 / 1024; // MB/s

            if (isVisible) {
                document.getElementById("speed").innerText = show((currentPeriodBytes / timeDiff) * 1000, ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s', 'PB/s'], [0, 0, 1, 2, 2, 2]);
                document.getElementById("mbps").innerText = show((currentPeriodBytes / timeDiff) * 8000, ['Bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps'], [0, 0, 0, 2, 2, 2]);
            } else {
                document.title = `${show(allDownSum + allDownActive, ['B', 'KB', 'MB', 'GB', 'TB', 'PB'], [0, 0, 0, 2, 2, 2])} | ${show((currentPeriodBytes / timeDiff) * 1000, ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s', 'PB/s'], [0, 0, 0, 2, 2, 2])}`;
            }

            lastAllDown = allDownActive;
            lastDate = now;
        }

        setTimeout(calculateSpeed, 1000);
    }

    /**
     * 统计并监控消耗的总流量
     */
    function monitorTotalTraffic() {
        const allDownActive = sum(threadDown);
        const currentTotal = allDownSum + allDownActive;

        if (isVisible) {
            document.getElementById("total").innerText = show(currentTotal, ['B', 'KB', 'MB', 'GB', 'TB', 'PB'], [0, 0, 1, 2, 2, 2]);
        }

        // 检查是否达到最大限制流量 (Maximum 变量在 index.html 脚本中声明)
        if (typeof Maximum !== 'undefined' && Maximum > 0 && currentTotal >= Maximum) {
            stopTest();
            return;
        }

        if (isRunning) {
            // 将 16ms 定时器改为 requestAnimationFrame，帧率同步，性能更优且省电
            requestAnimationFrame(monitorTotalTraffic);
        } else {
            allDownSum += allDownActive;
            document.getElementById("total").innerText = show(allDownSum, ['B', 'KB', 'MB', 'GB', 'TB', 'PB'], [0, 0, 1, 2, 2, 2]);
        }
    }

    /**
     * 开始测试
     */
    async function startTest() {
        if (typeof Maximum !== 'undefined' && Maximum > 0 && allDownSum >= Maximum) {
            allDownSum = 0;
        }

        maxThreads = parseInt(document.getElementById("thread").value, 10) || 4;
        let urlInput = document.getElementById("link").value.trim();

        if (urlInput.length < 10) {
            alert("链接不合法");
            return;
        }

        // 规范化并校验 URL
        urlInput = urlInput.substring(0, 5).toLowerCase() + urlInput.substring(5);
        if (!/^(https):\/\/([\w-]+\.)+[\w-]+(\/[\w- .\/?%&=]*)?/.test(urlInput)) {
            alert("由于浏览器安全限制，仅支持 https 协议合规链接");
            return;
        }

        testUrl = urlInput;
        const doBtn = document.getElementById('do');
        doBtn.innerText = '正在检验链接...';
        doBtn.disabled = true;

        // 测前连接性验证
        try {
            const response = await fetch(testUrl, { cache: "no-store", mode: 'cors', referrerPolicy: 'no-referrer' });
            const reader = response.body.getReader();
            const { value } = await reader.read();
            if (!value || value.length === 0) throw new Error("资源响应异常");
            await reader.cancel();
        } catch (err) {
            console.warn(err);
            doBtn.innerText = '开始';
            doBtn.disabled = false;
            alert("该链接不可用。如果可在新标签页打开，则大概率触发了浏览器的跨域(CORS)限制，请更换允许跨域的CDN节点。");
            return;
        }

        // 初始化状态
        document.getElementById('describe').innerText = '实时速度';
        doBtn.innerText = '停止';
        doBtn.disabled = false;

        lastAllDown = 0;
        startTime = Date.now();
        lastDate = startTime;
        isRunning = true;
        threadDown = new Array(maxThreads).fill(0);

        // 并发启动线程
        for (let i = 0; i < maxThreads; i++) {
            startThread(i);
        }

        calculateSpeed();
        monitorTotalTraffic();
    }

    /**
     * 停止测试
     */
    function stopTest() {
        isRunning = false;
        const doBtn = document.getElementById('do');
        if (doBtn) doBtn.innerText = '开始';
    }

    // 辅助求和函数
    function sum(arr) {
        return arr.reduce((acc, cur) => acc + (cur || 0), 0);
    }

    // 暴露入口给 HTML 元素绑定
    window.botton_clicked = function() {
        if (isRunning) {
            stopTest();
        } else {
            startTest();
        }
    };

    // 监听窗口可见性，避免后台运行时浪费不必要的 DOM 渲染性能
    document.addEventListener("visibilitychange", () => {
        isVisible = (document.visibilityState === 'visible');
    });
})();
