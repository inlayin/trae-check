<template>
  <div class="modal-overlay" v-if="visible" @click.self="handleBackground">
    <div class="modal-content">
      <div class="modal-header">
        <h2>发现新版本 <span class="version">v{{ info?.version }}</span></h2>
        <button class="close-btn" @click="handleBackground">✕</button>
      </div>

      <div class="modal-body">
        <div class="update-meta" v-if="info?.releaseDate">
          发布日期：{{ info.releaseDate }}
        </div>

        <div class="release-notes-label">更新内容：</div>
        <div class="release-notes">{{ info?.releaseNotes || '暂无更新说明' }}</div>

        <div class="progress-section" v-if="status === 'downloading'">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progress + '%' }"></div>
          </div>
          <div class="progress-text">{{ Math.round(progress) }}%</div>
        </div>

        <div class="status-msg downloaded" v-else-if="status === 'downloaded'">
          ✓ 更新已下载完成，可立即安装
        </div>

        <div class="status-msg error" v-else-if="status === 'error'">
          ✗ 下载失败：{{ errorMsg }}
        </div>
      </div>

      <div class="modal-footer">
        <template v-if="status === 'downloaded'">
          <button class="btn btn-secondary" @click="handleBackground">稍后</button>
          <button class="btn btn-primary" @click="handleInstall">立即重启安装</button>
        </template>
        <template v-else-if="status === 'error'">
          <button class="btn btn-secondary" @click="handleBackground">关闭</button>
        </template>
        <template v-else>
          <button class="btn btn-secondary" @click="handleCancel">取消</button>
          <button class="btn btn-primary" @click="handleBackground">后台更新</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps<{
  visible: boolean
  info: { version: string; releaseNotes: string; releaseDate: string } | null
}>()

const emit = defineEmits(['update:visible'])

const progress = ref(0)
const status = ref<'downloading' | 'downloaded' | 'error'>('downloading')
const errorMsg = ref('')

let unsubProgress: (() => void) | undefined
let unsubDownloaded: (() => void) | undefined
let unsubError: (() => void) | undefined

function clearListeners() {
  unsubProgress?.()
  unsubDownloaded?.()
  unsubError?.()
  unsubProgress = unsubDownloaded = unsubError = undefined
}

function startDownload() {
  progress.value = 0
  status.value = 'downloading'
  errorMsg.value = ''
  clearListeners()
  unsubProgress = window.electronAPI.updater.onProgress((p) => {
    progress.value = p.percent
  })
  unsubDownloaded = window.electronAPI.updater.onDownloaded(() => {
    status.value = 'downloaded'
    progress.value = 100
  })
  unsubError = window.electronAPI.updater.onError((msg) => {
    status.value = 'error'
    errorMsg.value = msg
  })
  void window.electronAPI.updater.download()
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      startDownload()
    } else {
      clearListeners()
    }
  }
)

onUnmounted(() => clearListeners())

function close() {
  emit('update:visible', false)
}

// 后台更新：仅关闭弹窗，不取消下载
function handleBackground() {
  close()
}

// 取消：停止下载并关闭
function handleCancel() {
  void window.electronAPI.updater.cancel()
  close()
}

function handleInstall() {
  void window.electronAPI.updater.install()
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  width: 480px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 600;
}

.version {
  color: var(--primary-color);
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-muted);
  padding: 4px;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.update-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 14px;
}

.release-notes-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.release-notes {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 12px;
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 18px;
}

.progress-section {
  margin-top: 4px;
}

.progress-bar {
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary-color);
  transition: width 0.2s ease;
}

.progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
  text-align: right;
}

.status-msg {
  font-size: 13px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  margin-top: 4px;
}

.status-msg.downloaded {
  color: var(--success-color);
  background: #d1fae5;
}

.status-msg.error {
  color: var(--danger-color);
  background: #fee2e2;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
}
</style>
