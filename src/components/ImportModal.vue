<template>
  <div class="modal-overlay" v-if="visible" @click.self="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h2>导入账号</h2>
        <button class="close-btn" @click="handleClose">✕</button>
      </div>

      <div class="modal-body">
        <!-- 步骤 1: 输入密码 -->
        <div v-if="step === 'password'" class="step-password">
          <div class="file-info">
            <span class="file-icon">📄</span>
            <span class="file-name">{{ fileName }}</span>
          </div>
          <div class="tip-box" v-if="hasCredentials">
            <div class="tip-icon">🔐</div>
            <div class="tip-content">
              <p class="tip-desc">该文件包含加密凭证，请输入导出时设置的密码以解密。</p>
            </div>
          </div>
          <div class="form-field">
            <label class="field-label">导入密码</label>
            <input
              type="password"
              v-model="password"
              placeholder="请输入导入密码"
              class="text-input"
              @keyup.enter="handleDecryptPreview"
            />
          </div>
        </div>

        <!-- 步骤 2: 预览 + 导入 -->
        <div v-if="step === 'preview'" class="step-preview">
          <!-- 统计信息 -->
          <div class="stats-bar">
            <div class="stat-pill">
              <span class="stat-num">{{ previewAccounts.length }}</span>
              <span class="stat-text">个账号</span>
            </div>
            <div class="stat-pill conflict" v-if="conflictCount > 0">
              <span class="stat-num">{{ conflictCount }}</span>
              <span class="stat-text">个冲突</span>
            </div>
            <div class="stat-pill invalid" v-if="invalidCount > 0">
              <span class="stat-num">{{ invalidCount }}</span>
              <span class="stat-text">个无效</span>
            </div>
          </div>

          <!-- 凭证跨机器提示 -->
          <div class="tip-box" v-if="hasCredentials">
            <div class="tip-icon">💡</div>
            <div class="tip-content">
              <p class="tip-desc">凭证将用本机加密服务重新加密，跨设备导入后可直接签到。</p>
            </div>
          </div>

          <!-- 账号预览列表 -->
          <div class="preview-list">
            <div
              v-for="account in previewAccounts"
              :key="account.id"
              class="preview-item"
              :class="{ conflict: account.conflict }"
            >
              <div class="preview-icon">
                <span v-if="account.conflict">⚠️</span>
                <span v-else>✓</span>
              </div>
              <div class="preview-info">
                <span class="preview-name">{{ account.name }}</span>
                <span class="preview-meta" v-if="account.desktopUserId">ID: {{ account.desktopUserId.slice(0, 12) }}...</span>
                <span class="preview-meta" v-else>Cookie 账号</span>
              </div>
              <span class="preview-tag" :class="account.conflict ? 'tag-conflict' : 'tag-new'">
                {{ account.conflict ? '冲突' : '新增' }}
              </span>
            </div>
          </div>

          <!-- 冲突策略 -->
          <div class="strategy-section" v-if="conflictCount > 0">
            <label class="strategy-title">冲突处理方式：</label>
            <div class="strategy-options">
              <label class="strategy-option" :class="{ active: strategy === 'skip' }">
                <input type="radio" v-model="strategy" value="skip" />
                <span>跳过冲突账号</span>
              </label>
              <label class="strategy-option" :class="{ active: strategy === 'overwrite' }">
                <input type="radio" v-model="strategy" value="overwrite" />
                <span>覆盖冲突账号</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleClose">取消</button>

        <!-- 步骤 1 按钮 -->
        <button
          v-if="step === 'password'"
          class="btn btn-primary"
          @click="handleDecryptPreview"
          :disabled="decrypting || !password"
        >
          <span v-if="decrypting" class="spinner"></span>
          <span>{{ decrypting ? '解密中...' : '解密预览' }}</span>
        </button>

        <!-- 步骤 2 按钮 -->
        <button
          v-if="step === 'preview'"
          class="btn btn-primary"
          @click="handleImport"
          :disabled="submitting || previewAccounts.length === 0"
        >
          <span v-if="submitting" class="spinner"></span>
          <span>{{ submitting ? '导入中...' : '确认导入' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { useAppStore } from '../stores/app'

const showAlert = inject<(title: string, message?: string, type?: string) => Promise<boolean>>('showAlert')!

interface PreviewAccount {
  id: string
  name: string
  desktopUserId?: string
  conflict: boolean
  hasCredential?: boolean
  [key: string]: any
}

const props = defineProps<{
  visible: boolean
  filePath: string
  fileName: string
  hasCredentials: boolean
}>()

const emit = defineEmits(['update:visible', 'imported'])

const store = useAppStore()
const step = ref<'password' | 'preview'>('password')
const password = ref('')
const strategy = ref<'skip' | 'overwrite'>('skip')
const decrypting = ref(false)
const submitting = ref(false)
const previewAccounts = ref<PreviewAccount[]>([])
const invalidCount = ref(0)

const conflictCount = computed(() => previewAccounts.value.filter(a => a.conflict).length)

function handleClose() {
  emit('update:visible', false)
}

async function handleDecryptPreview() {
  decrypting.value = true
  try {
    const result = await store.importPreview(props.filePath, password.value)
    if (!result.success) {
      void showAlert('解密失败', result.message, 'error')
      return
    }
    previewAccounts.value = result.accounts || []
    invalidCount.value = result.invalidCount || 0
    step.value = 'preview'
  } catch (e: any) {
    void showAlert('解密失败', e.message || String(e), 'error')
  } finally {
    decrypting.value = false
  }
}

async function handleImport() {
  submitting.value = true
  try {
    const result = await store.importAccounts(props.filePath, password.value, strategy.value)
    if (result.success) {
      let msg = `成功导入 ${result.imported} 个账号`
      if (result.skipped > 0) {
        msg += `，跳过 ${result.skipped} 个`
      }
      emit('imported', msg)
    } else {
      void showAlert('导入失败', result.message, 'error')
    }
  } catch (e: any) {
    void showAlert('导入失败', e.message || String(e), 'error')
  } finally {
    submitting.value = false
  }
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
  width: 520px;
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

/* 步骤 1: 密码输入 */
.step-password {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
}

.file-icon {
  font-size: 18px;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  word-break: break-all;
}

.tip-box {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: var(--primary-light);
  border-radius: var(--radius-sm);
}

.tip-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.tip-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.text-input {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease;
}

.text-input:focus {
  border-color: var(--primary-color);
}

/* 步骤 2: 预览 */
.stats-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.stat-pill {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 8px 14px;
  background: var(--primary-light);
  border-radius: var(--radius-sm);
}

.stat-pill.conflict {
  background: #fef3c7;
}

.stat-pill.invalid {
  background: #fee2e2;
}

.stat-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--primary-color);
}

.stat-pill.conflict .stat-num {
  color: #92400e;
}

.stat-pill.invalid .stat-num {
  color: #991b1b;
}

.stat-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.preview-list {
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 16px;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.preview-item:hover {
  background: var(--bg-secondary);
}

.preview-item.conflict {
  background: #fffbeb;
}

.preview-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.preview-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preview-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.preview-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.preview-tag {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 9999px;
}

.tag-new {
  background: #d1fae5;
  color: #065f46;
}

.tag-conflict {
  background: #fef3c7;
  color: #92400e;
}

.strategy-section {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.strategy-title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.strategy-options {
  display: flex;
  gap: 12px;
}

.strategy-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s ease;
}

.strategy-option:hover {
  border-color: var(--primary-light);
}

.strategy-option.active {
  border-color: var(--primary-color);
  background: var(--primary-light);
}

.strategy-option input {
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
}
</style>
