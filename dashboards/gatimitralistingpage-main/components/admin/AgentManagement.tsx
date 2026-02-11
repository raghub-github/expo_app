'use client';

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import { Agent } from '@/types';
import AccessManagementPanel from './AccessManagementPanel';

export default function AgentManagement() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdAgent, setCreatedAgent] = useState<{ agentId: string; email: string; password: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; email: string } | null>(null);
  const [accessPanel, setAccessPanel] = useState<{ userId: string; email: string; agentId?: string } | null>(null);
  const [formData, setFormData] = useState({
    agentId: '',
    email: '',
    password: '',
    name: '',
  });

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/agents');
      const data = await response.json();
      setAgents(data.agents || []);
    } catch (error) {
      console.error('Error fetching agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          createdBy: user?.id || '',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store created agent credentials to show
        setCreatedAgent({
          agentId: formData.agentId,
          email: formData.email,
          password: formData.password,
        });
        setShowCreateModal(false);
        setFormData({ agentId: '', email: '', password: '', name: '' });
        fetchAgents();
      } else {
        alert(data.error || 'Failed to create agent');
      }
    } catch (error) {
      console.error('Error creating agent:', error);
      alert('Error creating agent. Please try again.');
    }
  };

  const toggleAgentStatus = async (agentId: string, isActive: boolean) => {
    try {
      await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      });
      fetchAgents();
    } catch (error) {
      console.error('Error updating agent:', error);
    }
  };

  const toggleAgentApproval = async (agentId: string, isApproved: boolean) => {
    try {
      await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isApproved: !isApproved }),
      });
      fetchAgents();
    } catch (error) {
      console.error('Error updating agent approval:', error);
    }
  };

  const handleDeleteAgent = async (agentId: string, email: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        setDeleteConfirm(null);
        fetchAgents();
        alert('Agent credentials deleted successfully. User can no longer access any services.');
      } else {
        alert(data.error || 'Failed to delete agent');
      }
    } catch (error) {
      console.error('Error deleting agent:', error);
      alert('Error deleting agent. Please try again.');
    }
  };

  const handleRoleChange = async (agentId: string, newRole: 'admin' | 'agent') => {
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        fetchAgents();
        alert(`Role updated to ${newRole} successfully!`);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update role');
      }
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Error updating role. Please try again.');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-neutral-dark">Manage Agents</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-primary-mint hover:bg-primary-dark text-neutral-dark font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          Create New Agent
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-mint mx-auto"></div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-neutral-light">
              <tr>
                <th className="p-4 text-left font-bold text-neutral-dark text-sm">Agent ID</th>
                <th className="p-4 text-left font-bold text-neutral-dark text-sm">Email</th>
                <th className="p-4 text-left font-bold text-neutral-dark text-sm">Name</th>
                <th className="p-4 text-left font-bold text-neutral-dark text-sm">Role</th>
                <th className="p-4 text-left font-bold text-neutral-dark text-sm">Status</th>
                <th className="p-4 text-left font-bold text-neutral-dark text-sm">Approved</th>
                <th className="p-4 text-left font-bold text-neutral-dark text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const userRole = agent.user && typeof agent.user === 'object' && !Array.isArray(agent.user)
                  ? (agent.user as any).role
                  : 'agent';
                return (
                  <tr key={agent.id} className="border-b border-gray-200">
                    <td 
                      className="p-4 text-sm text-neutral-dark cursor-pointer hover:text-primary-dark hover:underline font-semibold"
                      onClick={() => {
                        const userId = agent.user && typeof agent.user === 'object' && !Array.isArray(agent.user)
                          ? (agent.user as any).id
                          : null;
                        if (userId) {
                          setAccessPanel({ userId, email: agent.email, agentId: agent.agentId });
                        }
                      }}
                    >
                      {agent.agentId}
                    </td>
                    <td 
                      className="p-4 text-sm text-neutral-dark cursor-pointer hover:text-primary-dark hover:underline"
                      onClick={() => {
                        const userId = agent.user && typeof agent.user === 'object' && !Array.isArray(agent.user)
                          ? (agent.user as any).id
                          : null;
                        if (userId) {
                          setAccessPanel({ userId, email: agent.email, agentId: agent.agentId });
                        }
                      }}
                    >
                      {agent.email}
                    </td>
                    <td className="p-4 text-sm text-neutral-dark">{agent.name || '-'}</td>
                    <td className="p-4">
                      {user?.role === 'super_admin' ? (
                        <select
                          value={userRole}
                          onChange={(e) => handleRoleChange(agent.id, e.target.value as 'admin' | 'agent')}
                          className="px-2 py-1 rounded text-xs font-semibold border border-gray-300 bg-white"
                        >
                          <option value="agent">Agent</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          userRole === 'admin'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {userRole === 'admin' ? 'Admin' : 'Agent'}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          agent.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {agent.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          agent.isApproved
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {agent.isApproved ? 'Approved' : 'Pending'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => toggleAgentStatus(agent.id, agent.isActive)}
                          className={`px-3 py-1 rounded text-xs font-semibold ${
                            agent.isActive
                              ? 'bg-red-100 text-red-800 hover:bg-red-200'
                              : 'bg-green-100 text-green-800 hover:bg-green-200'
                          }`}
                        >
                          {agent.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => toggleAgentApproval(agent.id, agent.isApproved)}
                          className="px-3 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800 hover:bg-blue-200"
                        >
                          {agent.isApproved ? 'Revoke' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ id: agent.id, email: agent.email })}
                          className="px-3 py-1 rounded text-xs font-semibold bg-red-100 text-red-800 hover:bg-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createdAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-green-600 mb-4">✅ Agent Created Successfully!</h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-semibold text-green-800 mb-2">Agent Credentials:</p>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Agent ID:</span> 
                  <span className="ml-2 font-mono bg-white px-2 py-1 rounded">{createdAgent.agentId}</span>
                </div>
                <div>
                  <span className="font-medium">Email:</span> 
                  <span className="ml-2 font-mono bg-white px-2 py-1 rounded">{createdAgent.email}</span>
                </div>
                <div>
                  <span className="font-medium">Password:</span> 
                  <span className="ml-2 font-mono bg-white px-2 py-1 rounded">{createdAgent.password}</span>
                </div>
              </div>
              <p className="text-xs text-green-700 mt-3">
                ⚠️ Please save these credentials. You can send them to the agent.
              </p>
            </div>
            <button
              onClick={() => {
                setCreatedAgent(null);
                navigator.clipboard.writeText(`Agent ID: ${createdAgent.agentId}\nEmail: ${createdAgent.email}\nPassword: ${createdAgent.password}`);
                alert('Credentials copied to clipboard!');
              }}
              className="w-full bg-primary-mint hover:bg-primary-dark text-neutral-dark font-semibold py-2 px-4 rounded-lg transition-colors mb-2"
            >
              Copy Credentials
            </button>
            <button
              onClick={() => setCreatedAgent(null)}
              className="w-full bg-gray-200 hover:bg-gray-300 text-neutral-dark font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-neutral-dark mb-4">Create New Agent</h3>
            <p className="text-sm text-neutral-gray mb-4">
              Create a new agent account. You can manually set the Agent ID and password.
            </p>
            <form onSubmit={handleCreateAgent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-2">
                  Agent ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.agentId}
                  onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
                  required
                  placeholder="e.g., AGENT001"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-mint focus:border-transparent"
                />
                <p className="text-xs text-neutral-gray mt-1">Unique identifier for the agent</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-2">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  placeholder="Set a secure password"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-mint focus:border-transparent"
                />
                <p className="text-xs text-neutral-gray mt-1">Agent will use this password to login</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-2">
                  Name (Optional)
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-neutral-dark font-semibold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-mint hover:bg-primary-dark text-neutral-dark font-semibold rounded-lg transition-colors"
                >
                  Create Agent
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-red-600 mb-4">⚠️ Delete Credentials</h3>
            <p className="text-sm text-neutral-gray mb-4">
              Are you sure you want to delete credentials for <strong>{deleteConfirm.email}</strong>?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800">
                <strong>Warning:</strong> This will permanently:
              </p>
              <ul className="text-sm text-red-700 mt-2 list-disc list-inside">
                <li>Delete the agent from the database</li>
                <li>Delete the user account</li>
                <li>Remove all permissions</li>
                <li>Prevent the user from accessing any services</li>
              </ul>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-neutral-dark font-semibold hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteAgent(deleteConfirm.id, deleteConfirm.email)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Access Management Panel */}
      {accessPanel && (
        <AccessManagementPanel
          userId={accessPanel.userId}
          userEmail={accessPanel.email}
          agentId={accessPanel.agentId}
          onClose={() => setAccessPanel(null)}
          onUpdate={() => {
            fetchAgents();
          }}
        />
      )}
    </div>
  );
}

