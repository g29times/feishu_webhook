// 划线取词助手 - Content Script
(function() {
  'use strict';

  let floatingButton = null;
  let selectedText = '';

  // 创建浮动按钮
  function createFloatingButton() {
    if (floatingButton) {
      return floatingButton;
    }

    const button = document.createElement('div');
    button.id = 'text-selector-floating-btn';
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 17L12 22L22 17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 12L12 17L22 12" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    button.style.display = 'none';
    document.body.appendChild(button);
    
    // 点击按钮发送数据
    button.addEventListener('click', async function(e) {
      e.stopPropagation();
      if (selectedText) {
        await sendToWebhook(selectedText);
      }
      hideFloatingButton();
    });

    floatingButton = button;
    return button;
  }

  // 显示浮动按钮
  function showFloatingButton(x, y, text) {
    const button = createFloatingButton();
    selectedText = text;
    
    // 设置按钮位置
    button.style.left = `${x}px`;
    button.style.top = `${y}px`;
    button.style.display = 'flex';
    
    // 添加动画效果
    button.classList.remove('fade-out');
    button.classList.add('fade-in');
  }

  // 隐藏浮动按钮
  function hideFloatingButton() {
    if (floatingButton) {
      floatingButton.classList.remove('fade-in');
      floatingButton.classList.add('fade-out');
      setTimeout(() => {
        floatingButton.style.display = 'none';
        selectedText = '';
      }, 200);
    }
  }

  // 发送到Webhook（通过background script）
  async function sendToWebhook(idea) {
    try {
      // 显示加载状态
      if (floatingButton) {
        floatingButton.classList.add('loading');
      }

      // 获取当前页面URL
      const pageUrl = window.location.href;

      // 发送消息给background script
      chrome.runtime.sendMessage(
        { action: 'sendToWebhook', idea: idea, url: pageUrl },
        function(response) {
          if (floatingButton) {
            floatingButton.classList.remove('loading');
          }

          if (chrome.runtime.lastError) {
            console.error('消息发送失败:', chrome.runtime.lastError);
            showNotification('✗ 发送失败', 'error');
            return;
          }

          if (response && response.success) {
            // 成功提示
            showNotification('✓ 已发送到飞书', 'success');
          } else {
            showNotification('✗ 发送失败', 'error');
          }
        }
      );
    } catch (error) {
      console.error('发送失败:', error);
      if (floatingButton) {
        floatingButton.classList.remove('loading');
      }
      showNotification('✗ 网络错误', 'error');
    }
  }

  // 显示通知
  function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `text-selector-notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 2000);
  }

  // 监听文本选择
  document.addEventListener('mouseup', function(e) {
    // 延迟一点获取选中文本，确保选择完成
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (text.length > 0) {
        // 获取选中文本的位置
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // 计算按钮位置（在选中文本上方居中）
        const buttonX = rect.left + (rect.width / 2) - 25 + window.scrollX;
        const buttonY = rect.top - 60 + window.scrollY;

        showFloatingButton(buttonX, buttonY, text);
      } else {
        hideFloatingButton();
      }
    }, 10);
  });

  // 点击其他地方隐藏按钮
  document.addEventListener('mousedown', function(e) {
    if (floatingButton && !floatingButton.contains(e.target)) {
      // 延迟隐藏，避免与mouseup冲突
      setTimeout(() => {
        const selection = window.getSelection();
        if (selection.toString().trim().length === 0) {
          hideFloatingButton();
        }
      }, 100);
    }
  });

  // 监听滚动事件，隐藏按钮
  let scrollTimeout;
  document.addEventListener('scroll', function() {
    if (floatingButton && floatingButton.style.display !== 'none') {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        hideFloatingButton();
      }, 100);
    }
  }, true);

  console.log('划线取词助手已加载');

  // ==================== 笔记管理器 ====================
  class NoteManager {
    constructor() {
      this.currentUrl = window.location.href;
      this.storageKey = `notes_${this.currentUrl}`;
      this.notes = [];
      this.isOpen = false;
      
      // DOM 元素引用
      this.toggleBtn = null;
      this.sidebar = null;
      this.overlay = null;
      this.noteList = null;
      this.textarea = null;
      
      this.init();
    }

    async init() {
      // 加载笔记数据
      await this.loadNotes();
      
      // 创建UI
      this.createToggleButton();
      this.createSidebar();
      this.createOverlay();
      
      // 更新徽章
      this.updateBadge();
    }

    // 创建常驻入口按钮
    createToggleButton() {
      this.toggleBtn = document.createElement('div');
      this.toggleBtn.className = 'note-sidebar-toggle';
      this.toggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      `;
      
      this.toggleBtn.addEventListener('click', () => this.toggle());
      document.body.appendChild(this.toggleBtn);
    }

    // 创建侧边栏
    createSidebar() {
      this.sidebar = document.createElement('div');
      this.sidebar.className = 'note-sidebar';
      this.sidebar.innerHTML = `
        <div class="note-sidebar-header">
          <h3>📝 当前页面笔记</h3>
          <button class="note-sidebar-close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="note-list-container"></div>
        <div class="note-input-container">
          <textarea class="note-input-textarea" placeholder="记录你对这个页面的想法..."></textarea>
          <div class="note-input-actions">
            <button class="note-input-btn primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"></path>
              </svg>
              添加笔记
            </button>
          </div>
        </div>
      `;
      
      // 绑定事件
      this.sidebar.querySelector('.note-sidebar-close').addEventListener('click', () => this.close());
      this.sidebar.querySelector('.note-input-btn.primary').addEventListener('click', () => this.addNote());
      
      this.noteList = this.sidebar.querySelector('.note-list-container');
      this.textarea = this.sidebar.querySelector('.note-input-textarea');
      
      // 支持 Ctrl+Enter 快速添加
      this.textarea.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
          this.addNote();
        }
      });
      
      document.body.appendChild(this.sidebar);
      
      // 渲染笔记列表
      this.renderNotes();
    }

    // 创建遮罩层
    createOverlay() {
      this.overlay = document.createElement('div');
      this.overlay.className = 'note-sidebar-overlay';
      this.overlay.addEventListener('click', () => this.close());
      document.body.appendChild(this.overlay);
    }

    // 切换侧边栏
    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }

    // 打开侧边栏
    open() {
      this.isOpen = true;
      this.sidebar.classList.add('active');
      this.overlay.classList.add('active');
      this.toggleBtn.classList.add('active');
      this.textarea.focus();
    }

    // 关闭侧边栏
    close() {
      this.isOpen = false;
      this.sidebar.classList.remove('active');
      this.overlay.classList.remove('active');
      this.toggleBtn.classList.remove('active');
    }

    // 从 storage 加载笔记
    async loadNotes() {
      return new Promise((resolve) => {
        chrome.storage.local.get([this.storageKey], (result) => {
          this.notes = result[this.storageKey] || [];
          resolve();
        });
      });
    }

    // 保存笔记到 storage
    async saveNotes() {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [this.storageKey]: this.notes }, () => {
          resolve();
        });
      });
    }

    // 渲染笔记列表
    renderNotes() {
      if (this.notes.length === 0) {
        this.noteList.innerHTML = `
          <div class="note-list-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <div>还没有笔记，开始记录吧！</div>
          </div>
        `;
        return;
      }

      // 按时间倒序显示（最新的在上面）
      const sortedNotes = [...this.notes].sort((a, b) => b.createdAt - a.createdAt);
      
      this.noteList.innerHTML = sortedNotes.map(note => `
        <div class="note-item" data-id="${note.id}">
          <div class="note-item-content">${this.escapeHtml(note.content)}</div>
          <div class="note-item-footer">
            <div class="note-item-time">${this.formatTime(note.createdAt)}</div>
            <div class="note-item-actions">
              <button class="note-item-btn send" data-action="send" title="发送到飞书">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
              <button class="note-item-btn delete" data-action="delete" title="删除">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `).join('');

      // 绑定按钮事件
      this.noteList.querySelectorAll('.note-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const noteId = parseInt(btn.closest('.note-item').dataset.id);
          const action = btn.dataset.action;
          
          if (action === 'send') {
            this.sendNoteToWebhook(noteId);
          } else if (action === 'delete') {
            this.deleteNote(noteId);
          }
        });
      });
    }

    // 添加笔记
    async addNote() {
      const content = this.textarea.value.trim();
      
      if (!content) {
        this.textarea.focus();
        return;
      }

      const note = {
        id: Date.now(),
        content: content,
        createdAt: Date.now()
      };

      this.notes.push(note);
      await this.saveNotes();
      
      // 清空输入框
      this.textarea.value = '';
      
      // 重新渲染
      this.renderNotes();
      this.updateBadge();
      
      // 显示成功提示
      showNotification('✓ 笔记已保存', 'success');
    }

    // 删除笔记
    async deleteNote(noteId) {
      if (!confirm('确定要删除这条笔记吗？')) {
        return;
      }

      this.notes = this.notes.filter(note => note.id !== noteId);
      await this.saveNotes();
      
      this.renderNotes();
      this.updateBadge();
      
      showNotification('✓ 笔记已删除', 'success');
    }

    // 发送笔记到 Webhook
    async sendNoteToWebhook(noteId) {
      const note = this.notes.find(n => n.id === noteId);
      if (!note) return;

      await sendToWebhook(note.content);
    }

    // 更新徽章数字
    updateBadge() {
      const count = this.notes.length;
      
      // 移除旧徽章
      const oldBadge = this.toggleBtn.querySelector('.note-badge');
      if (oldBadge) {
        oldBadge.remove();
      }

      // 如果有笔记，显示数量
      if (count > 0) {
        const badge = document.createElement('div');
        badge.className = 'note-badge';
        badge.textContent = count > 99 ? '99+' : count;
        this.toggleBtn.appendChild(badge);
      }
    }

    // 格式化时间
    formatTime(timestamp) {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;

      // 1分钟内
      if (diff < 60000) {
        return '刚刚';
      }
      // 1小时内
      if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}分钟前`;
      }
      // 今天
      if (date.toDateString() === now.toDateString()) {
        return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      }
      // 昨天
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) {
        return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      }
      // 其他
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    }

    // HTML转义
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // 初始化笔记管理器
  const noteManager = new NoteManager();
  console.log('笔记管理器已加载');
})();
