<template>
  <div class="modal-overlay" v-if="visible" @click.self="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h2>导出账号</h2>
        <button class="close-btn" @click="handleClose">✕</button>
      </div>

      <div class="modal-body">
        <p class="modal-desc">选择要导出的账号，数据将以 JSON 文件形式保存到本地。</p>

        <!-- 全选操作 -->
        <div class="select-bar">
          <label class="form-checkbox">
            <input type="checkbox" :checked="allSelected" @change="toggleAll" />
            <span>全选 ({{ selectedIds.length }} / {{ store.accounts.length }})</span>
          </label>
        </div>

        <!-- 账号列表 -->
        <div class="account-list-export">
          <label
            v-for="account in store.accounts"
            :key="account.id"
            class="account-item-export"
            :class="{ selected: selectedIds.includes(account.id) }"
          >
            <input
              type="checkbox"
              :value="account.id"
              v-model="selectedIds"
            />
            <div class="account-info-export">
              <span class="account-name-export">{{ account.name }}</span>
              <span class="account-meta-export" v-if="account.desktopUserId">ID: {{ account.desktopUserId.slice(0, 12) }}...</span>
              <span class="account-meta-export" v-else>Cookie 账号</span>
            </div>
          </label>
        </div>

        <!-- 凭证选项 -->
        <div class="credential-option">
          <label class="form-checkbox">
            <input type="checkbox" v-model="includeCredentials" />
            <span>包含登录凭证（cookie、加密凭证）</span>
          </label>
          <div class="tip-box" v-if="includeCredentials">
            <div class="tip-icon">⚠️</div>
            <div class="tip-content">
              <p class="tip-desc">导出文件将包含登录凭证，请注意保管，避免泄露。</p>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleClose">取消</button>
        <button
          class="btn btn-primary"
          @click="handleExport"
          :disabled="submitting || selectedIds.length === 0"
        >
          <span v-if="submitting" class="spinner"></span>
          <span>{{ submitting ? '导出中...' : `导出 ${selectedIds.length} 个账号` }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore } from '../stores/app'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits(['update:visible', 'success'])

const store = useAppStore()
const selectedIds = ref<string[]>([])
const includeCredentials = ref(true)
const submitting = ref(false)

const allSelected = computed(() =>
  store.accounts.length > 0 && selectedIds.value.length === store.accounts.length
)

watch(() => props.visible, (val) => {
  if (val) {
    // 默认全选
    selectedIds.value = store.accounts.map(a => a.id)
    includeCredentials.value = true
  }
})

function toggleAll() {
  if (allSelected.value) {
    selectedIds.value = []
  } else {
    selectedIds.value = store.accounts.map(a => a.id)
  }
}

function handleClose() {
  emit('update:visible', false)
}

async function handleExport() {
  if (includeCredentials.value) {
    const confirmed = window.confirm('导出文件包含登录凭证，请注意保管，确认导出？')
    if (!confirmed) return
  }

  submitting.value = true
  try {
    // 解除 Vue Proxy，避免 IPC 序列化失败
    const safeIds = JSON.parse(JSON.stringify(selectedIds.value))
    const safeIncludeCredentials = Boolean(includeCredentials.value)
    const result = await store.exportAccounts(safeIds, safeIncludeCredentials)
    if (result.success) {
      emit('success', result.path)
    } else if (result.canceled) {
      // 用户主动取消，不提示错误
      handleClose()
    } else {
      alert(result.message || '导出失败')
    }
  } catch (e: any) {
    alert('导出失败: ' + (e.message || e))
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

.modal-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.select-bar {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
}

.account-list-export {
  max-height: 240px;
  overflow-y: auto;
  margin-bottom: 16px;
}

.account-item-export {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s ease;
}

.account-item-export:hover {
  background: var(--bg-secondary);
}

.account-item-export.selected {
  background: var(--primary-light);
}

.account-item-export input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
}

.account-info-export {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-name-export {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.account-meta-export {
  font-size: 11px;
  color: var(--text-muted);
}

.credential-option {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.form-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-primary);
}

.form-checkbox input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.tip-box {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: #fef3c7;
  border-radius: var(--radius-sm);
  margin-top: 10px;
}

.tip-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.tip-desc {
  font-size: 12px;
  color: #92400e;
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
}
</style>
