// 飞书网页助手 - Content Script
(function() {
  'use strict';

  let floatingButton = null;
  let selectedText = '';
  let noteManager = null;

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
    
    // 点击按钮：将选中文本写入右侧笔记面板（不直接发送）
    button.addEventListener('click', async function(e) {
      e.stopPropagation();
      if (selectedText) {
        if (noteManager) {
          noteManager.prefillNewNote(selectedText);
        }
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
            console.log('[feishu_webhook] send success');
            // 成功提示
            showNotification('✓ 已发送到飞书', 'success');
          } else {
            console.error('[feishu_webhook] send failed:', response && response.error ? response.error : response);
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

  console.log('飞书网页助手已加载');

  // ==================== 笔记管理器 ====================
  class NoteManager {
    constructor() {
      this.currentUrl = window.location.href;
      this.storageKey = `notes_${this.currentUrl}`;
      this.togglePositionKey = 'note_sidebar_toggle_top';
      this.notes = [];
      this.isOpen = false;
      
      // DOM 元素引用
      this.toggleBtn = null;
      this.sidebar = null;
      this.overlay = null;
      this.noteList = null;
      this.textarea = null;

      // toggle 拖动状态
      this.isDraggingToggle = false;
      this.didDragToggle = false;
      this.toggleDragStartY = 0;
      this.toggleDragStartTop = 0;
      
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

    // 预填充一条新笔记到输入框，并打开侧边栏
    prefillNewNote(text) {
      const value = (text || '').trim();
      if (!value) return;

      const pageTitle = (document.title || '').trim();

      this.open();
      if (pageTitle && this.titleInput && !this.titleInput.value.trim()) {
        this.titleInput.value = pageTitle;
      }
      if (this.textarea) {
        this.textarea.value = value;
        this.textarea.focus();
        try {
          this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
        } catch (e) {
          // ignore
        }
      }
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

      // 恢复上次拖动位置（如果有）
      chrome.storage.local.get([this.togglePositionKey], (result) => {
        const savedTop = result[this.togglePositionKey];
        if (typeof savedTop === 'number' && isFinite(savedTop)) {
          this.applyToggleTop(savedTop);
        }
      });

      // 点击展开/收起（如果是拖动导致的 mouseup，则不触发 toggle）
      this.toggleBtn.addEventListener('click', () => {
        if (this.didDragToggle) {
          this.didDragToggle = false;
          return;
        }
        this.toggle();
      });

      // 仅在侧边栏收缩状态支持上下拖动（Y轴）
      this.toggleBtn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (this.isOpen) return;

        this.isDraggingToggle = true;
        this.didDragToggle = false;
        this.toggleDragStartY = e.clientY;

        const rect = this.toggleBtn.getBoundingClientRect();
        this.toggleDragStartTop = rect.top;

        this.toggleBtn.classList.add('free-top');
        this.toggleBtn.style.transition = 'none';

        e.preventDefault();
      });

      const onMouseMove = (e) => {
        if (!this.isDraggingToggle) return;
        if (this.isOpen) return;

        const dy = e.clientY - this.toggleDragStartY;
        if (Math.abs(dy) > 3) {
          this.didDragToggle = true;
        }

        const nextTop = this.toggleDragStartTop + dy;
        this.applyToggleTop(nextTop);
      };

      const onMouseUp = () => {
        if (!this.isDraggingToggle) return;
        this.isDraggingToggle = false;

        this.toggleBtn.style.transition = '';

        // 持久化当前 top
        const rect = this.toggleBtn.getBoundingClientRect();
        chrome.storage.local.set({ [this.togglePositionKey]: rect.top });
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      document.body.appendChild(this.toggleBtn);
    }

    // 应用 toggle 的 top（限制在可视区域内）
    applyToggleTop(topPx) {
      if (!this.toggleBtn) return;

      const btnHeight = this.toggleBtn.offsetHeight || 56;
      const padding = 8;
      const maxTop = Math.max(padding, window.innerHeight - btnHeight - padding);
      const clampedTop = Math.min(Math.max(topPx, padding), maxTop);

      this.toggleBtn.classList.add('free-top');
      this.toggleBtn.style.top = `${clampedTop}px`;
    }

    // 创建侧边栏
    createSidebar() {
      this.sidebar = document.createElement('div');
      this.sidebar.className = 'note-sidebar';
      this.sidebar.innerHTML = `
        <div class="note-sidebar-header">
          <h3>📝 当前页面笔记</h3>
          <div class="note-header-actions">
            <button class="note-batch-send-btn" title="批量发送">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 2L11 13"></path>
                <path d="M22 2L15 22L11 13L2 9L22 2Z"></path>
              </svg>
            </button>
            <button class="note-sidebar-close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            </button>
          </div>
        </div>
        <div class="note-list-container"></div>
        <div class="note-input-container">
          <input type="text" class="note-input-title" placeholder="标题 (可选)" />
          <textarea class="note-input-textarea" placeholder="记录你对这个页面的想法..."></textarea>
          <input type="text" class="note-input-labels" placeholder="标签 (可选，用逗号分隔)" />
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
      this.sidebar.querySelector('.note-batch-send-btn').addEventListener('click', () => this.showBatchSendModal());
      this.sidebar.querySelector('.note-input-btn.primary').addEventListener('click', () => this.addNote());
      
      this.noteList = this.sidebar.querySelector('.note-list-container');
      this.titleInput = this.sidebar.querySelector('.note-input-title');
      this.textarea = this.sidebar.querySelector('.note-input-textarea');
      this.labelsInput = this.sidebar.querySelector('.note-input-labels');
      
      // 支持 Ctrl+Enter 快速添加
      const handleShortcut = (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
          this.addNote();
        }
      };
      this.titleInput.addEventListener('keydown', handleShortcut);
      this.textarea.addEventListener('keydown', handleShortcut);
      this.labelsInput.addEventListener('keydown', handleShortcut);
      
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
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2 2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <div>还没有笔记，开始记录吧！</div>
          </div>
        `;
        return;
      }

      // 按时间倒序显示（最新的在上面）
      const sortedNotes = [...this.notes].sort((a, b) => b.createdAt - a.createdAt);
      
      this.noteList.innerHTML = sortedNotes.map(note => {
        const titleHtml = note.title ? `<div class="note-item-title">${this.escapeHtml(note.title)}</div>` : '';
        const labelsHtml = note.labels && note.labels.length > 0 
          ? `<div class="note-item-labels">${note.labels.map(l => `<span class="note-label-tag">${this.escapeHtml(l)}</span>`).join('')}</div>` 
          : '';
          
        return `
        <div class="note-item" data-id="${note.id}">
          <div class="note-item-footer">
            <div class="note-item-time">${this.formatTime(note.createdAt)}</div>
            <div class="note-item-actions">
              <button class="note-item-btn copy" data-action="copy" title="复制内容">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
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
          ${titleHtml}
          <div class="note-item-content">${this.escapeHtml(note.content)}</div>
          ${labelsHtml}
        </div>
      `}).join('');

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
          } else if (action === 'copy') {
            this.copyNoteContent(noteId);
          }
        });
      });
    }

    // 添加笔记
    async addNote() {
      const content = this.textarea.value.trim();
      const title = this.titleInput.value.trim();
      const labelsStr = this.labelsInput.value.trim();
      
      if (!content && !title) {
        this.textarea.focus();
        return;
      }

      // 解析标签
      const labels = labelsStr ? labelsStr.split(/[,，]/).map(s => s.trim()).filter(s => s) : [];

      const note = {
        id: Date.now(),
        content: content,
        title: title,
        labels: labels,
        createdAt: Date.now()
      };

      this.notes.push(note);
      await this.saveNotes();
      
      // 清空输入框
      this.textarea.value = '';
      this.titleInput.value = '';
      this.labelsInput.value = '';
      
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

    // 复制笔记内容
    async copyNoteContent(noteId) {
      const note = this.notes.find(n => n.id === noteId);
      if (!note) return;

      try {
        await navigator.clipboard.writeText(note.content);
        showNotification('✓ 内容已复制', 'success');
      } catch (err) {
        console.error('复制失败:', err);
        showNotification('✗ 复制失败', 'error');
      }
    }

    // 发送笔记到 Webhook
    async sendNoteToWebhook(noteId) {
      const note = this.notes.find(n => n.id === noteId);
      if (!note) return;

      // 构建更丰富的数据对象
      const data = {
        idea: note.content,
        title: note.title || '',
        labels: note.labels ? note.labels.join(', ') : ''
      };

      await sendToWebhook(data);
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

    // 显示批量发送模态窗口
    showBatchSendModal() {
      if (this.notes.length === 0) {
        showNotification('✗ 没有可发送的笔记', 'error');
        return;
      }

      // 创建模态窗口
      const modal = document.createElement('div');
      modal.className = 'note-batch-modal-overlay';
      modal.innerHTML = `
        <div class="note-batch-modal">
          <div class="note-batch-modal-header">
            <h3>📤 批量发送笔记</h3>
            <button class="note-batch-modal-close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="note-batch-modal-body">
            <p class="note-batch-info">将发送 <strong>${this.notes.length}</strong> 条笔记到飞书</p>
            <div class="note-batch-form">
              <div class="note-batch-field">
                <label>统一标题 (可选)</label>
                <input type="text" class="note-batch-title" placeholder="留空则使用各笔记原标题" />
              </div>
              <div class="note-batch-field">
                <label>统一标签 (可选)</label>
                <input type="text" class="note-batch-labels" placeholder="留空则使用各笔记原标签，用逗号分隔" />
              </div>
            </div>
            <div class="note-batch-progress" style="display: none;">
              <div class="note-batch-progress-bar">
                <div class="note-batch-progress-fill"></div>
              </div>
              <div class="note-batch-progress-text">准备发送...</div>
            </div>
          </div>
          <div class="note-batch-modal-footer">
            <button class="note-batch-btn cancel">取消</button>
            <button class="note-batch-btn send">开始发送</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // 绑定事件
      const closeModal = () => modal.remove();
      modal.querySelector('.note-batch-modal-close').addEventListener('click', closeModal);
      modal.querySelector('.note-batch-btn.cancel').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      // 发送按钮（使用标志位防止重复点击）
      let isSending = false;
      modal.querySelector('.note-batch-btn.send').addEventListener('click', async () => {
        if (isSending) return; // 防止重复点击
        isSending = true;
        const batchTitle = modal.querySelector('.note-batch-title').value.trim();
        const batchLabels = modal.querySelector('.note-batch-labels').value.trim();
        await this.executeBatchSend(modal, batchTitle, batchLabels);
      });

      // 显示动画
      requestAnimationFrame(() => modal.classList.add('active'));
    }

    // 执行批量发送（串行）
    async executeBatchSend(modal, batchTitle, batchLabels) {
      const sendBtn = modal.querySelector('.note-batch-btn.send');
      const cancelBtn = modal.querySelector('.note-batch-btn.cancel');
      const progressContainer = modal.querySelector('.note-batch-progress');
      const progressFill = modal.querySelector('.note-batch-progress-fill');
      const progressText = modal.querySelector('.note-batch-progress-text');
      const formContainer = modal.querySelector('.note-batch-form');

      // 禁用按钮，显示进度
      sendBtn.disabled = true;
      sendBtn.textContent = '发送中...';
      cancelBtn.style.display = 'none';
      formContainer.style.display = 'none';
      progressContainer.style.display = 'block';

      const total = this.notes.length;
      let success = 0;
      let failed = 0;

      // 解析批量标签
      const parsedBatchLabels = batchLabels 
        ? batchLabels.split(/[,，]/).map(s => s.trim()).filter(s => s).join(', ')
        : null;

      // 串行发送每条笔记
      for (let i = 0; i < this.notes.length; i++) {
        const note = this.notes[i];
        progressText.textContent = `正在发送 ${i + 1}/${total}...`;
        progressFill.style.width = `${((i + 1) / total) * 100}%`;

        try {
          // 构建发送数据，应用统一标题/标签（如果有）
          const data = {
            idea: note.content,
            title: batchTitle || note.title || '',
            labels: parsedBatchLabels !== null ? parsedBatchLabels : (note.labels ? note.labels.join(', ') : '')
          };

          await this.sendSingleNote(data);
          success++;
        } catch (error) {
          console.error('批量发送失败:', error);
          failed++;
        }

        // 添加短暂延迟，避免请求过快
        if (i < this.notes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      // 显示结果
      progressText.textContent = `发送完成: ${success} 成功, ${failed} 失败`;
      sendBtn.textContent = '完成';
      sendBtn.disabled = false;
      sendBtn.onclick = () => modal.remove();

      if (failed === 0) {
        showNotification(`✓ 已发送 ${success} 条笔记`, 'success');
      } else {
        showNotification(`⚠ ${success} 成功, ${failed} 失败`, 'error');
      }
    }

    // 发送单条笔记（返回 Promise）
    sendSingleNote(data) {
      return new Promise((resolve, reject) => {
        const pageUrl = window.location.href;
        chrome.runtime.sendMessage(
          { action: 'sendToWebhook', idea: data, url: pageUrl },
          function(response) {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            if (response && response.success) {
              resolve(response);
            } else {
              reject(new Error('发送失败'));
            }
          }
        );
      });
    }
  }

  // 初始化笔记管理器
  noteManager = new NoteManager();
  console.log('笔记管理器已加载');
})();
