<template>
  <div class="account-card card" :class="{ disabled: !account.enabled }">
    <!-- 卡片头部 -->
    <div class="card-header">
      <div class="account-info">
        <div class="avatar">{{ account.name.charAt(0).toUpperCase() }}</div>
        <div class="account-name-wrap">
          <h3 class="account-name">{{ account.name }}</h3>
          <span class="badge" :class="statusBadgeClass">
            {{ statusText }}
          </span>
        </div>
      </div>
      <div class="switch" :class="{ active: account.enabled }" @click="handleToggle">
      </div>
    </div>

    <!-- 卡片内容 -->
    <div class="card-body">
      <div class="info-row">
        <span class="info-label">上次签到</span>
        <span class="info-value">{{ lastCheckinText }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">总积分</span>
        <span class="info-value points">
          {{ account.points || 0 }} 分
        </span>
      </div>
      <div class="info-row">
        <span class="info-label">添加时间</span>
        <span class="info-value">{{ formatDate(account.createdAt) }}</span>
      </div>
      <div class="info-row" v-if="account.credentialStatus">
        <span class="info-label">桌面凭证</span>
        <span class="info-value" :class="account.credentialStatus === 'expired' ? 'text-danger' : 'text-success'">
          {{ credentialStatusText }}
        </span>
      </div>
    </div>

    <!-- 卡片底部 -->
    <div class="card-footer">
      <button
        class="btn btn-sm btn-primary"
        @click="handleCheckin"
        :disabled="checkingIn || !account.enabled"
      >
        <span v-if="checkingIn" class="spinner"></span>
        <span>{{ checkingIn ? '签到中' : '立即签到' }}</span>
      </button>
      <button type="button" class="btn btn-sm btn-outline" @click.stop="startEdit">
        编辑
      </button>
      <button class="btn btn-sm btn-outline danger" @click="handleDelete">
        删除
      </button>
    </div>
  </div>
  <div v-if="editing" class="edit-overlay" @click.self="cancelEdit">
    <div class="edit-dialog">
      <h3>编辑账号名称</h3>
      <input v-model="draftName" autofocus @keyup.enter="saveEdit" @keyup.esc="cancelEdit" />
      <div class="edit-actions"><button class="btn btn-sm btn-outline" @click="cancelEdit">取消</button><button class="btn btn-sm btn-primary" @click="saveEdit">保存</button></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Account } from '../stores/app'

const props = defineProps<{
  account: Account
}>()

const emit = defineEmits(['checkin', 'toggle', 'delete', 'edit'])

const checkingIn = ref(false)
const editing = ref(false)
const draftName = ref(props.account.name)

const statusText = computed(() => {
  if (!props.account.enabled) return '已停用'
  if (!props.account.lastCheckinAt) return '未签到'

  const today = new Date().toDateString()
  const lastDate = new Date(props.account.lastCheckinAt).toDateString()

  if (lastDate === today) {
    return props.account.lastCheckinResult === 'success' ? '今日已签' : '今日失败'
  }
  return '待签到'
})

const statusBadgeClass = computed(() => {
  if (!props.account.enabled) return 'badge-muted'
  if (!props.account.lastCheckinAt) return 'badge-warning'

  const today = new Date().toDateString()
  const lastDate = new Date(props.account.lastCheckinAt).toDateString()

  if (lastDate === today) {
    return props.account.lastCheckinResult === 'success' ? 'badge-success' : 'badge-danger'
  }
  return 'badge-info'
})

const lastCheckinText = computed(() => {
  if (!props.account.lastCheckinAt) return '从未签到'
  return formatDateTime(props.account.lastCheckinAt)
})

const credentialStatusText = computed(() => {
  if (props.account.credentialStatus === 'expired') return '凭证已失效，请重新导入'
  if (props.account.credentialStatus === 'expiring') return '凭证即将续期'
  return '凭证有效'
})

function handleToggle() {
  emit('toggle', props.account.id, !props.account.enabled)
}

async function handleCheckin() {
  checkingIn.value = true
  try {
    emit('checkin', props.account.id)
  } finally {
    setTimeout(() => {
      checkingIn.value = false
    }, 1000)
  }
}

function handleDelete() {
  emit('delete', props.account.id)
}

function startEdit() { draftName.value = props.account.name; editing.value = true }
function cancelEdit() { editing.value = false }
function saveEdit() { const name = draftName.value.trim(); if (name && name !== props.account.name) emit('edit', props.account.id, name); editing.value = false }


function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`

  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.account-card {
  padding: 18px;
}

.account-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.account-card.disabled {
  opacity: 0.6;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.account-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-color), #8b5cf6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
}

.account-name-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.account-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.account-name-input { width: 120px; height: 24px; border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 6px; }
.badge { width: fit-content; align-self: flex-start; white-space: nowrap; }
.edit-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.35); }
.edit-dialog { width: 360px; padding: 20px; border-radius: 10px; background: var(--bg-primary); box-shadow: var(--shadow-lg); }
.edit-dialog input { width: 100%; box-sizing: border-box; margin: 16px 0; padding: 9px; border: 1px solid var(--border-color); border-radius: 6px; }
.edit-actions { display: flex; justify-content: flex-end; gap: 8px; }

.card-body {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}

.info-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.info-value {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-value.points {
  color: var(--warning-color);
  font-weight: 600;
}

.text-success {
  color: var(--success-color);
}

.text-danger {
  color: var(--danger-color);
}

.card-footer {
  display: flex;
  gap: 8px;
}

.card-footer .btn {
  flex: 1;
}

.btn-outline.danger {
  color: var(--danger-color);
  border-color: #fecaca;
}

.btn-outline.danger:hover {
  background-color: #fef2f2;
}

.refresh-points-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 6px;
  border: none;
  background: transparent;
  color: var(--warning-color);
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1;
  transition: all 0.2s ease;
  vertical-align: middle;
}

.refresh-points-btn:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.1);
  transform: rotate(180deg);
}

.refresh-points-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner-sm {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(245, 158, 11, 0.3);
  border-top-color: var(--warning-color);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.points-message {
  padding: 6px 10px;
  margin-top: 4px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
}

.points-message.success {
  background: rgba(34, 197, 94, 0.1);
  color: var(--success-color);
}

.points-message.error {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger-color);
}
</style>
