const { PluginSettingTab, Plugin, Setting } = require('obsidian');

module.exports = class TranslatePlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new TranslateSettingTab(this.app, this));
    if (this.settings.autoTranslate) {
      this.observeSettingsPanel();
    }
    console.log("插件设置汉化器已加载");
  }

  async loadSettings() {
    this.settings = Object.assign({
      apiKey: '',
      autoTranslate: false
    }, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async translateText(text) {
    if (!this.settings.apiKey || !text) return text;
    try {
      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${this.settings.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: text,
            target: 'zh-CN',
            format: 'text'
          })
        }
      );
      const data = await res.json();
      if (data && data.data && data.data.translations && data.data.translations[0]) {
        return data.data.translations[0].translatedText;
      }
    } catch (e) {
      console.error('翻译失败', e);
    }
    return text;
  }

  observeSettingsPanel() {
    const insertTranslateButton = () => {
      const settingsContainer = document.querySelector('.modal-settings, .vertical-tab-content-container');
      if (!settingsContainer) return;
      // 避免重复插入按钮
      if (settingsContainer.querySelector('.translate-settings-btn')) return;
      const btn = document.createElement('button');
      btn.textContent = '中文';
      btn.className = 'translate-settings-btn';
      btn.style.margin = '8px 0 16px 0';
      btn.style.padding = '4px 12px';
      btn.style.background = '#3a3a3a';
      btn.style.color = '#fff';
      btn.style.border = 'none';
      btn.style.borderRadius = '4px';
      btn.style.cursor = 'pointer';
      const status = document.createElement('span');
      status.style.marginLeft = '12px';
      status.style.transition = 'opacity 0.2s';
      status.style.opacity = '1';
      let translated = false;
      let originalNodes = [];
      let originalTexts = [];
      // 检查本地缓存是否已翻译过当前设置面板
      const panelKey = this.getPanelCacheKey(settingsContainer);
      let panelTranslated = localStorage.getItem(panelKey) === '1';
      if (panelTranslated) {
        translated = true;
        btn.textContent = '原文';
      }
      btn.onclick = async () => {
        if (!translated) {
          status.textContent = '正在翻译...';
          status.style.opacity = '0.4';
          // 记录原文
          const walker = document.createTreeWalker(settingsContainer, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => /[a-zA-Z]/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
          });
          originalNodes = [];
          originalTexts = [];
          let n;
          while (n = walker.nextNode()) {
            originalNodes.push(n);
            originalTexts.push(n.nodeValue);
          }
          await this.translateAllNodes(settingsContainer);
          status.textContent = '翻译完成';
          status.style.opacity = '1';
          btn.textContent = '原文';
          translated = true;
          // 标记本面板已翻译
          localStorage.setItem(panelKey, '1');
          setTimeout(() => status.textContent = '', 2000);
        } else {
          // 恢复原文
          for (let i = 0; i < originalNodes.length; i++) {
            if (originalNodes[i] && originalTexts[i]) {
              originalNodes[i].nodeValue = originalTexts[i];
            }
          }
          btn.textContent = '中文';
          translated = false;
          // 取消本地面板翻译标记
          localStorage.removeItem(panelKey);
        }
      };
      // 如果已翻译过，自动显示翻译内容
      if (panelTranslated) {
        this.translateAllNodes(settingsContainer);
      }
      settingsContainer.prepend(btn);
      settingsContainer.prepend(status);
    };
    // 监听设置面板切换
    const observer = new MutationObserver(() => {
      insertTranslateButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // 初次插入
    insertTranslateButton();
  }

  getPanelCacheKey(settingsContainer) {
    // 用设置面板的唯一选择器+插件id做key，防止不同插件面板冲突
    let pluginId = '';
    const tab = settingsContainer.querySelector('.vertical-tab-header, .setting-item-name');
    if (tab && tab.textContent) {
      pluginId = tab.textContent.trim();
    }
    return `obsidian-translate-panel-${pluginId}`;
  }

  async translateAllNodes(root) {
    if (!this.translationCache) {
      // 以插件版本为key，防止插件升级后缓存失效
      this.translationCache = JSON.parse(localStorage.getItem('obsidian-translate-cache') || '{}');
      if (!this.translationCache.version || this.translationCache.version !== this.manifest.version) {
        this.translationCache = { version: this.manifest.version, map: {} };
      }
    }
    const cache = this.translationCache.map;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => /[a-zA-Z]/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    const nodes = [];
    let n;
    while (n = walker.nextNode()) nodes.push(n);
    for (const node of nodes) {
      const original = node.nodeValue;
      if (cache[original]) {
        node.nodeValue = cache[original];
      } else {
        const translated = await this.translateText(original);
        if (translated && translated !== original) {
          node.nodeValue = translated;
          cache[original] = translated;
          localStorage.setItem('obsidian-translate-cache', JSON.stringify(this.translationCache));
        }
      }
    }
  }
};

class TranslateSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    let { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "插件设置汉化器 - 设置" });

    new Setting(containerEl)
      .setName("Google API 密钥")
      .setDesc("填写你的 Google Translate API 密钥")
      .addText(text => text
        .setPlaceholder("AIza...")
        .setValue(this.plugin.settings.apiKey || "")
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("自动翻译设置面板")
      .setDesc("开启后将自动翻译插件设置界面")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoTranslate || false)
        .onChange(async (value) => {
          this.plugin.settings.autoTranslate = value;
          await this.plugin.saveSettings();
        }));
  }
}
