let approvalCenterState = {
    tasks: [],
    recentActivity: [],
    summary: {},
    decisions: new Map(),
    history: [],
    selectedTaskIds: new Set()
};

document.addEventListener('DOMContentLoaded', () => {
    document
        .getElementById('refreshApprovalCenter')
        ?.addEventListener('click', loadApprovalCenter);
    document
        .getElementById('exportApprovalCenter')
        ?.addEventListener('click', exportApprovalCenterCsv);

    ['approvalSearch', 'approvalPriorityFilter', 'approvalTypeFilter', 'approvalWorkflowFilter', 'approvalSlaFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderApprovalQueue);
        document.getElementById(id)?.addEventListener('change', renderApprovalQueue);
    });

    document.getElementById('clearApprovalFilters')?.addEventListener('click', () => {
        setInputValue('approvalSearch', '');
        setInputValue('approvalPriorityFilter', '');
        setInputValue('approvalTypeFilter', '');
        setInputValue('approvalWorkflowFilter', 'all');
        setInputValue('approvalSlaFilter', '');
        renderApprovalQueue();
    });

    document.getElementById('approvalTaskList')?.addEventListener('click', onApprovalTaskClick);
    document.getElementById('bulkApprovalStatus')?.addEventListener('change', renderApprovalBulkState);
    document.getElementById('selectVisibleApprovalTasks')?.addEventListener('click', selectVisibleApprovalTasks);
    document.getElementById('clearSelectedApprovalTasks')?.addEventListener('click', clearSelectedApprovalTasks);
    document.getElementById('applyBulkApproval')?.addEventListener('click', applyBulkApprovalDecision);

    loadApprovalCenter();
});

async function loadApprovalCenter() {
    const token = localStorage.getItem('token');
    const button = document.getElementById('refreshApprovalCenter');

    if (!token) {
        window.location.href = '/';
        return;
    }

    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing';
    }

    try {
        const data = await fetch(`${window.API_URL}/dashboard/approval-center`, {
            headers: { Authorization: `Bearer ${token}` }
        }).then(async response => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.success) {
                throw new Error(payload.message || 'Approval center could not be loaded');
            }
            return payload;
        });

        const decisions = buildDecisionMap(data.approvals || []);
        const baseTasks = data.tasks || [];
        const tasks = applyApprovalDecisions(
            mergeApprovalTasks(baseTasks, []),
            decisions
        );
        const summary = rebuildApprovalSummary(data.summary || {}, tasks);

        approvalCenterState = {
            tasks,
            recentActivity: data.recent_activity || [],
            summary,
            decisions,
            history: data.history || [],
            selectedTaskIds: approvalCenterState.selectedTaskIds || new Set()
        };
        pruneSelectedApprovalTasks();

        renderApprovalSummary();
        renderApprovalQueue();
        setText('approvalUpdated', `Updated ${formatApprovalDate(data.generated_at, true)}`);
    } catch (error) {
        console.error('Approval center error:', error);
        renderApprovalError(error);
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-rotate"></i> Refresh';
        }
    }
}

function buildDecisionMap(decisions = []) {
    return new Map(
        decisions
            .filter(decision => decision.task_id)
            .map(decision => [decision.task_id, decision])
    );
}

function applyApprovalDecisions(tasks, decisions) {
    return tasks.map(task => {
        const decision = decisions.get(task.id);
        const workflowStatus = decision?.decision_status || task.workflowStatus || 'pending_review';

        return {
            ...task,
            workflowStatus,
            workflowNotes: decision?.notes || task.workflowNotes || '',
            workflowBy: decision?.decided_by_nombre || task.workflowBy || '',
            workflowAt: decision?.decided_at || decision?.updated_at || task.workflowAt || '',
            decision
        };
    });
}

function buildPrepaidTasks(schedules = []) {
    return schedules
        .map(schedule => {
            const status = String(schedule.status || '').toUpperCase();
            const isDraft = Boolean(schedule.is_draft) || Number(schedule.id) < 0;
            const hasDifference =
                status === 'DIFFERENCE' ||
                Number(schedule.difference_count || 0) > 0 ||
                Number(schedule.missing_gl_count || 0) > 0 ||
                Math.abs(Number(schedule.difference_total || 0)) > 0.01;
            const saved = Boolean(schedule.metadata_json?.saved_workbook?.saved_at);
            const needsSave = isDraft || (!saved && Number(schedule.generated_month_count || 0) > 0);
            const priority = hasDifference ? 'high' : 'normal';
            const statusLabel = hasDifference
                ? 'Difference'
                : needsSave
                    ? 'Needs save'
                    : formatPrepaidStatus(status);

            return {
                id: `prepaid-${schedule.id}`,
                type: 'prepaid',
                priority,
                status: statusLabel,
                title: schedule.title || `Prepaid schedule #${schedule.id}`,
                context: [schedule.brand, schedule.schedule_year || schedule.tax_year]
                    .filter(Boolean)
                    .join(' / ') || 'Property Management',
                owner: 'Property Management',
                date: schedule.updated_at || schedule.created_at || schedule.generated_at,
                actionUrl: `/views/departments/prepaid-amortization?schedule=${encodeURIComponent(schedule.id)}`,
                detail: hasDifference
                    ? 'Schedule has GL differences or missing GL validation.'
                    : needsSave
                        ? 'Schedule is generated or drafted but still needs to be saved on the server.'
                        : 'Schedule requires operational review.'
            };
        });
}

function shouldShowPrepaidSchedule(schedule = {}) {
    const status = String(schedule.status || '').toUpperCase();
    const saved = Boolean(schedule.metadata_json?.saved_workbook?.saved_at);
    const isDraft = Boolean(schedule.is_draft) || Number(schedule.id) < 0;
    const generatedMonths = Number(schedule.generated_month_count || 0);
    const differenceCount = Number(schedule.difference_count || 0);
    const missingGlCount = Number(schedule.missing_gl_count || 0);
    const differenceTotal = Math.abs(Number(schedule.difference_total || 0));

    return isDraft ||
        ['SOURCE_LOADED', 'GENERATED', 'DIFFERENCE'].includes(status) ||
        generatedMonths > 0 && !saved ||
        differenceCount > 0 ||
        missingGlCount > 0 ||
        differenceTotal > 0.01;
}

function mergeApprovalTasks(baseTasks, extraTasks) {
    const byId = new Map();

    [...baseTasks, ...extraTasks].forEach(task => {
        const key = task.id || `${task.type}-${task.title}-${task.date}`;
        byId.set(key, task);
    });

    return Array.from(byId.values()).sort((a, b) => {
        const priority = { critical: 3, high: 2, normal: 1 };
        return (priority[b.priority] || 0) - (priority[a.priority] || 0)
            || new Date(b.date || 0) - new Date(a.date || 0);
    });
}

function rebuildApprovalSummary(summary, tasks) {
    const documentTasks = tasks.filter(task => task.type === 'document');
    const prepaidTasks = tasks.filter(task => task.type === 'prepaid');
    const scheduleTasks = tasks.filter(task => task.type === 'schedule');
    const incidentTasks = tasks.filter(task => task.type === 'incident');

    return {
        ...summary,
        total_tasks: tasks.length,
        critical: tasks.filter(task => task.priority === 'critical').length,
        high: tasks.filter(task => task.priority === 'high').length,
        documents_total: documentTasks.length,
        documents_pending: documentTasks.filter(task => /pending/i.test(task.status || '')).length,
        documents_with_issues: documentTasks.filter(task => /issue|error/i.test(task.status || '')).length,
        prepaid_attention: prepaidTasks.length,
        schedules_total: scheduleTasks.length,
        incidents_open: incidentTasks.length
    };
}

function formatPrepaidStatus(status) {
    return {
        SOURCE_LOADED: 'Source loaded',
        GENERATED: 'Generated',
        VALIDATED: 'Validated',
        DIFFERENCE: 'Difference'
    }[status] || status || 'Review';
}

function renderApprovalSummary() {
    const summary = approvalCenterState.summary || {};
    const slaRisk =
        Number(summary.overdue || 0)
        + Number(summary.due_soon || 0);

    setText('approvalTotalTasks', summary.total_tasks || 0);
    setText('approvalCriticalTasks', summary.critical || 0);
    setText('approvalHighTasks', summary.high || 0);
    setText('approvalSlaRiskTasks', slaRisk);
    setText(
        'approvalDocumentTasks',
        Number(summary.documents_total || 0)
    );
    setText(
        'approvalPrepaidTasks',
        Number(summary.prepaid_attention || 0)
    );
    setText(
        'approvalScheduleTasks',
        Number(summary.schedules_total || 0)
    );
    setText(
        'approvalSlaMeta',
        `${Number(summary.overdue || 0)} overdue / ${Number(summary.due_soon || 0)} due soon`
    );
}

function renderApprovalQueue() {
    const container = document.getElementById('approvalTaskList');
    if (!container) return;

    const tasks = getFilteredApprovalTasks();

    renderApprovalBulkState(tasks);

    if (!tasks.length) {
        container.innerHTML = `
            <div class="approval-empty">
                <i class="fa-solid fa-circle-check"></i>
                <strong>No matching tasks</strong>
                <span>The current filters do not have pending approval items.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = tasks.map(task => `
        <article class="approval-task is-${escapeHtml(task.priority || 'normal')} is-workflow-${escapeHtml(task.workflowStatus || 'pending_review')} ${approvalCenterState.selectedTaskIds.has(task.id) ? 'is-selected' : ''}">
            <label class="approval-task-select" title="Select task">
                <input
                    type="checkbox"
                    data-approval-select="${escapeHtml(task.id)}"
                    ${approvalCenterState.selectedTaskIds.has(task.id) ? 'checked' : ''}
                />
                <span></span>
            </label>
            <span class="approval-task-icon">
                <i class="fa-solid ${escapeHtml(getTaskIcon(task.type))}"></i>
            </span>
            <span class="approval-task-copy">
                <strong>${escapeHtml(task.title || 'Untitled task')}</strong>
                <small>${escapeHtml(task.detail || 'Review required')}</small>
                <em>${escapeHtml(task.context || 'Operations')} / ${escapeHtml(task.owner || 'System')}</em>
                ${task.workflowNotes ? `<em class="approval-task-note">${escapeHtml(task.workflowNotes)}</em>` : ''}
                <span class="approval-task-badges">
                    <i class="approval-sla is-${escapeHtml(task.sla_status || 'unknown')}">${escapeHtml(formatSlaLabel(task))}</i>
                    <i>${escapeHtml(formatTaskType(task.type))}</i>
                    <i>${Number(task.history_count || 0)} event${Number(task.history_count || 0) === 1 ? '' : 's'}</i>
                </span>
            </span>
            <span class="approval-task-meta">
                <b>${escapeHtml(formatWorkflowStatus(task.workflowStatus))}</b>
                <small>${escapeHtml(task.status || 'Open')} / ${formatApprovalDate(task.date)}</small>
                ${task.workflowBy ? `<small>${escapeHtml(task.workflowBy)} / ${formatApprovalDate(task.workflowAt, true)}</small>` : ''}
                <span class="approval-task-actions">
                    <a href="${escapeHtml(task.actionUrl || '#')}" title="Review source">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                    <button type="button" data-approval-history="${escapeHtml(task.id)}" title="History" aria-label="History">
                        <i class="fa-solid fa-timeline"></i>
                    </button>
                    ${renderApprovalActionButton(task, 'in_review', 'Review', 'fa-eye')}
                    ${renderApprovalActionButton(task, 'approved', 'Approve', 'fa-check')}
                    ${renderApprovalActionButton(task, 'changes_requested', 'Changes', 'fa-comment-dots')}
                    ${renderApprovalActionButton(task, 'rejected', 'Reject', 'fa-xmark')}
                    ${renderApprovalActionButton(task, 'resolved', 'Resolve', 'fa-flag-checkered')}
                </span>
            </span>
        </article>
    `).join('');
}

function getFilteredApprovalTasks() {
    const search = getInputValue('approvalSearch').toLowerCase();
    const priority = getInputValue('approvalPriorityFilter');
    const type = getInputValue('approvalTypeFilter');
    const workflow = getInputValue('approvalWorkflowFilter');
    const sla = getInputValue('approvalSlaFilter');

    return approvalCenterState.tasks.filter(task => {
        const haystack = [
            task.title,
            task.context,
            task.owner,
            task.status,
            task.detail
        ].join(' ').toLowerCase();

        return (!search || haystack.includes(search)) &&
            (!priority || task.priority === priority) &&
            (!type || task.type === type) &&
            (!sla || task.sla_status === sla) &&
            matchesWorkflowFilter(task, workflow);
    });
}

function matchesWorkflowFilter(task, workflow) {
    const status = task.workflowStatus || 'pending_review';

    if (!workflow) {
        return !['approved', 'rejected', 'resolved'].includes(status);
    }

    if (workflow === 'all') return true;
    return status === workflow;
}

function renderApprovalActionButton(task, status, label, icon) {
    if (task.workflowStatus === status) return '';

    return `
        <button
            type="button"
            data-approval-action="${escapeHtml(status)}"
            data-task-id="${escapeHtml(task.id)}"
            title="${escapeHtml(label)}"
            aria-label="${escapeHtml(label)}"
        >
            <i class="fa-solid ${escapeHtml(icon)}"></i>
        </button>
    `;
}

async function onApprovalTaskClick(event) {
    const select = event.target.closest('[data-approval-select]');
    if (select) {
        const taskId = select.dataset.approvalSelect;
        if (select.checked) {
            approvalCenterState.selectedTaskIds.add(taskId);
        } else {
            approvalCenterState.selectedTaskIds.delete(taskId);
        }
        select.closest('.approval-task')?.classList.toggle('is-selected', select.checked);
        renderApprovalBulkState();
        return;
    }

    const historyButton = event.target.closest('[data-approval-history]');
    if (historyButton) {
        event.preventDefault();
        event.stopPropagation();
        await showApprovalHistory(historyButton.dataset.approvalHistory);
        return;
    }

    const button = event.target.closest('[data-approval-action]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    const task = approvalCenterState.tasks.find(item => item.id === button.dataset.taskId);
    const status = button.dataset.approvalAction;

    if (!task || !status) return;
    await saveApprovalDecision(task, status, button);
}

function renderApprovalBulkState(visibleTasks = getFilteredApprovalTasks()) {
    const selectedCount = approvalCenterState.selectedTaskIds.size;
    const status = getInputValue('bulkApprovalStatus');
    const applyButton = document.getElementById('applyBulkApproval');

    setText('approvalSelectedCount', `${selectedCount} selected`);

    if (applyButton) {
        applyButton.disabled = selectedCount <= 0 || !status;
    }

    document
        .getElementById('selectVisibleApprovalTasks')
        ?.toggleAttribute('disabled', visibleTasks.length <= 0);
}

function selectVisibleApprovalTasks() {
    getFilteredApprovalTasks().forEach(task => {
        approvalCenterState.selectedTaskIds.add(task.id);
    });
    renderApprovalQueue();
}

function clearSelectedApprovalTasks() {
    approvalCenterState.selectedTaskIds.clear();
    renderApprovalQueue();
}

function pruneSelectedApprovalTasks() {
    const validIds = new Set(approvalCenterState.tasks.map(task => task.id));
    approvalCenterState.selectedTaskIds = new Set(
        Array.from(approvalCenterState.selectedTaskIds || [])
            .filter(id => validIds.has(id))
    );
}

async function applyBulkApprovalDecision() {
    const status = getInputValue('bulkApprovalStatus');
    const selectedTasks = approvalCenterState.tasks.filter(task =>
        approvalCenterState.selectedTaskIds.has(task.id)
    );

    if (!status || !selectedTasks.length) return;

    const notes = await requestApprovalNotes(
        {
            title: `${selectedTasks.length} selected items`,
            type: 'bulk',
            context: 'Bulk approval decision'
        },
        status
    );

    if (notes === null) return;

    const button = document.getElementById('applyBulkApproval');
    const originalHtml = button?.innerHTML;

    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Applying';
    }

    try {
        const results = [];

        for (const task of selectedTasks) {
            try {
                const data = await postApprovalDecision(task, status, notes);
                results.push({ task, success: true, data });
            } catch (error) {
                results.push({ task, success: false, error });
            }
        }

        const failures = results.filter(result => !result.success);
        const saved = results.length - failures.length;

        approvalCenterState.selectedTaskIds = new Set(
            failures.map(result => result.task.id)
        );
        setInputValue('bulkApprovalStatus', '');
        await loadApprovalCenter();

        if (failures.length && window.Swal) {
            await Swal.fire({
                icon: saved ? 'warning' : 'error',
                title: saved ? 'Bulk decision partially saved' : 'Bulk decision failed',
                text: `${saved} item(s) saved. ${failures.length} item(s) failed: ${failures.map(result => result.task.title).slice(0, 3).join(', ')}${failures.length > 3 ? '...' : ''}`
            });
        }
    } catch (error) {
        console.error('Bulk approval decision error:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Bulk decision not saved',
            text: error.message
        });
    } finally {
        if (button) {
            button.innerHTML = originalHtml;
            renderApprovalBulkState();
        }
    }
}

async function saveApprovalDecision(task, status, button) {
    const notes = await requestApprovalNotes(task, status);

    if (notes === null) return;

    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        const data = await postApprovalDecision(task, status, notes);

        if (data.decision) {
            approvalCenterState.decisions.set(task.id, data.decision);
            if (Array.isArray(data.history)) {
                approvalCenterState.history = [
                    ...data.history,
                    ...approvalCenterState.history.filter(event => event.task_id !== task.id)
                ];
            }
            approvalCenterState.tasks = applyApprovalDecisions(
                approvalCenterState.tasks,
                approvalCenterState.decisions
            );
            approvalCenterState.summary = rebuildApprovalSummary(
                approvalCenterState.summary,
                approvalCenterState.tasks
            );
        }

        await loadApprovalCenter();
    } catch (error) {
        console.error('Approval decision error:', error);
        if (window.Swal) {
            await Swal.fire({
                icon: 'error',
                title: 'Decision not saved',
                text: error.message
            });
        }
    } finally {
        button.disabled = false;
        button.innerHTML = originalHtml;
    }
}

async function postApprovalDecision(task, status, notes) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${window.API_URL}/dashboard/approval-center/decision`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            task_id: task.id,
            task_type: task.type,
            task_title: task.title,
            task_context: task.context,
            source_url: task.actionUrl,
            priority: task.priority,
            decision_status: status,
            notes
        })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
        throw new Error(data.message || 'Approval decision could not be saved');
    }

    return data;
}

async function requestApprovalNotes(task, status) {
    const label = formatWorkflowStatus(status);

    if (!window.Swal) {
        const confirmed = window.confirm(`${label}: ${task.title}`);
        return confirmed ? '' : null;
    }

    const result = await Swal.fire({
        icon: ['approved', 'resolved'].includes(status) ? 'success' : status === 'rejected' ? 'warning' : 'info',
        title: label,
        text: task.title,
        input: 'textarea',
        inputPlaceholder: 'Optional internal comment...',
        inputAttributes: {
            maxlength: 2000
        },
        showCancelButton: true,
        confirmButtonText: 'Save decision',
        cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return null;
    return String(result.value || '').trim();
}

function formatWorkflowStatus(status) {
    return {
        pending_review: 'Submitted',
        in_review: 'In review',
        approved: 'Approved',
        rejected: 'Rejected',
        changes_requested: 'Changes requested',
        resolved: 'Resolved'
    }[status] || 'Pending review';
}

function formatTaskType(type) {
    return {
        document: 'Document',
        prepaid: 'Prepaid',
        schedule: 'Schedule',
        incident: 'Incident'
    }[type] || 'Task';
}

function formatSlaLabel(task) {
    if (task.sla_status === 'closed') return 'Closed';
    if (task.sla_status === 'overdue') return 'Overdue';
    if (task.sla_status === 'due_soon') return 'Due soon';
    if (task.due_at) return `Due ${formatApprovalDate(task.due_at, true)}`;
    return 'SLA pending';
}

async function showApprovalHistory(taskId) {
    const token = localStorage.getItem('token');
    const task = approvalCenterState.tasks.find(item => item.id === taskId);

    if (!taskId || !window.Swal) return;

    let history = approvalCenterState.history.filter(event => event.task_id === taskId);

    try {
        const response = await fetch(`${window.API_URL}/dashboard/approval-center/history/${encodeURIComponent(taskId)}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success) {
            history = data.history || [];
            approvalCenterState.history = [
                ...history,
                ...approvalCenterState.history.filter(event => event.task_id !== taskId)
            ];
        }
    } catch (error) {
        console.warn('Approval history could not be refreshed:', error);
    }

    await Swal.fire({
        title: task?.title || 'Approval history',
        width: 760,
        html: renderApprovalHistoryHtml(history, task),
        confirmButtonText: 'Close'
    });
}

function renderApprovalHistoryHtml(history, task) {
    if (!history.length) {
        return `
            <div class="approval-history-modal">
                <p>No approval history has been recorded for this item yet.</p>
                ${task ? `<small>${escapeHtml(task.context || '')}</small>` : ''}
            </div>
        `;
    }

    return `
        <div class="approval-history-modal">
            ${history.map(event => `
                <article>
                    <span>
                        <strong>${escapeHtml(formatWorkflowStatus(event.new_status))}</strong>
                        <small>${escapeHtml(formatApprovalDate(event.created_at))}</small>
                    </span>
                    <p>${escapeHtml(event.comment || 'No comment provided.')}</p>
                    <em>${escapeHtml(event.actor_name || 'System')} / ${escapeHtml(formatWorkflowStatus(event.previous_status))} to ${escapeHtml(formatWorkflowStatus(event.new_status))}</em>
                </article>
            `).join('')}
        </div>
    `;
}

function exportApprovalCenterCsv() {
    const rows = approvalCenterState.tasks;

    if (!rows.length) {
        if (window.Swal) {
            Swal.fire({ icon: 'info', title: 'No rows to export' });
        }
        return;
    }

    const headers = [
        'Title',
        'Type',
        'Owner',
        'Context',
        'Priority',
        'Workflow',
        'Source status',
        'SLA',
        'Due at',
        'Last comment',
        'Last decision by',
        'Created'
    ];
    const csv = [
        headers,
        ...rows.map(task => [
            task.title,
            formatTaskType(task.type),
            task.owner,
            task.context,
            task.priority,
            formatWorkflowStatus(task.workflowStatus),
            task.status,
            formatSlaLabel(task),
            formatApprovalDate(task.due_at),
            task.workflowNotes,
            task.workflowBy,
            formatApprovalDate(task.date)
        ])
    ].map(row => row.map(csvEscape).join(',')).join('\r\n');

    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `approval-center-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function csvEscape(value) {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function renderApprovalError(error) {
    ['approvalTaskList'].forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = `<div class="approval-empty">${escapeHtml(error.message)}</div>`;
        }
    });
}

function getTaskIcon(type) {
    return {
        document: 'fa-file-circle-exclamation',
        prepaid: 'fa-building-columns',
        schedule: 'fa-calendar-days',
        incident: 'fa-bug'
    }[type] || 'fa-list-check';
}

function getInputValue(id) {
    return String(document.getElementById(id)?.value || '').trim();
}

function setInputValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value;
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value ?? '';
}

function formatApprovalDate(value, short = false) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString('en-US', short
        ? { hour: '2-digit', minute: '2-digit' }
        : { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
