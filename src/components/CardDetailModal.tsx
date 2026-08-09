import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Edit3, Eye, Columns, Save, Trash2, Tag, User, Plus } from 'lucide-react';
import { useKanbanStore } from '../store/useKanbanStore';

interface CardDetailModalProps {
  card: any;
  isOpen: boolean;
  onClose: () => void;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({ card, isOpen, onClose }) => {
  const updateCard = useKanbanStore((state) => state.updateCard);
  const deleteCard = useKanbanStore((state) => state.deleteCard);
  const columns = useKanbanStore((state) => state.columns);

  const [title, setTitle] = useState(card.title || '');
  const [description, setDescription] = useState(card.description || '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(card.priority || 'medium');
  const [assignee, setAssignee] = useState(card.assignee || 'Unassigned');
  const [columnId, setColumnId] = useState(card.columnId || 'backlog');
  const [tags, setTags] = useState<string[]>(card.tags || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'preview' | 'split'>('split');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen || !card) return null;

  const handleAddTag = () => {
    if (newTagInput.trim() && !tags.includes(newTagInput.trim())) {
      setTags([...tags, newTagInput.trim()]);
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateCard(card.id, {
        title: title.trim() || 'Untitled Card',
        description: description,
        priority,
        assignee,
        columnId,
        tags,
        updatedAt: Date.now(),
      });
      onClose();
    } catch (error) {
      console.error('Failed to save card:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this card?')) {
      await deleteCard(card.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40">
          <div className="flex items-center space-x-3 flex-1 mr-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Card title..."
              className="text-lg font-bold bg-transparent text-slate-900 dark:text-zinc-100 outline-none border-b border-transparent focus:border-blue-500 flex-1 py-1 transition-colors"
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleDelete}
              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
              title="Delete Card"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Card Properties Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-6 py-3 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs">
          {/* Priority */}
          <div>
            <label className="block font-medium text-slate-500 dark:text-zinc-400 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 rounded px-2 py-1 outline-none"
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
            </select>
          </div>

          {/* Column Status */}
          <div>
            <label className="block font-medium text-slate-500 dark:text-zinc-400 mb-1">Column</label>
            <select
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 rounded px-2 py-1 outline-none"
            >
              {columns.map((col: any) => (
                <option key={col.id} value={col.id}>
                  {col.title}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee */}
          <div>
            <label className="block font-medium text-slate-500 dark:text-zinc-400 mb-1">Assignee</label>
            <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded px-2 py-1">
              <User className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
              <input
                type="text"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Assignee..."
                className="w-full bg-transparent text-slate-800 dark:text-zinc-100 outline-none"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block font-medium text-slate-500 dark:text-zinc-400 mb-1">Add Tag</label>
            <div className="flex items-center space-x-1">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                placeholder="Tag name..."
                className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 rounded px-2 py-1 outline-none"
              />
              <button
                onClick={handleAddTag}
                className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Tags Chips */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-6 py-2 bg-slate-50/50 dark:bg-zinc-950/20 border-b border-slate-200 dark:border-zinc-800">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center space-x-1 px-2 py-0.5 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200/60 dark:border-zinc-700/60 rounded text-xs"
              >
                <Tag className="w-3 h-3 text-slate-400" />
                <span>{tag}</span>
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-100"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* View Mode Tab Controls */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            Description (Markdown Supported)
          </span>

          <div className="flex items-center bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setActiveTab('edit')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md transition-colors ${
                activeTab === 'edit'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs font-medium'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md transition-colors ${
                activeTab === 'preview'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs font-medium'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>

            <button
              onClick={() => setActiveTab('split')}
              className={`hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded-md transition-colors ${
                activeTab === 'split'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs font-medium'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Split View</span>
            </button>
          </div>
        </div>

        {/* Editor Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-zinc-950/30">
          {activeTab === 'edit' && (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Write task description using Markdown... (Supports headers #, task lists - [ ], tables, bold **text**, inline code `code`)"
              className="w-full h-full min-h-[300px] p-4 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 font-mono text-sm border border-slate-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-colors"
            />
          )}

          {activeTab === 'preview' && (
            <div className="min-h-[300px] p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg overflow-y-auto">
              {description.trim() ? (
                <div className="prose dark:prose-invert max-w-none text-sm text-slate-800 dark:text-zinc-100 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-slate-400 dark:text-zinc-500 italic text-sm">No description provided yet.</p>
              )}
            </div>
          )}

          {activeTab === 'split' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full min-h-[350px]">
              {/* Textarea */}
              <div className="flex flex-col">
                <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 mb-1">Markdown Source</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Write description in GFM..."
                  className="flex-1 p-3 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 font-mono text-xs border border-slate-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-colors"
                />
              </div>

              {/* Live Rendered Markdown */}
              <div className="flex flex-col">
                <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 mb-1">Live Rendered Markdown</span>
                <div className="flex-1 p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg overflow-y-auto">
                  {description.trim() ? (
                    <div className="prose dark:prose-invert max-w-none text-xs text-slate-800 dark:text-zinc-100 leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-slate-400 dark:text-zinc-500 italic text-xs">Live markdown preview will render here...</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40">
          <div className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
            {description.length} chars | {description.split('\n').length} lines
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
