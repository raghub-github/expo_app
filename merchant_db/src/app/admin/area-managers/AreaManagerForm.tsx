import React, { useState } from 'react';

interface AreaManagerFormProps {
  onSubmit: (manager: any) => void;
  loading?: boolean;
}

const AreaManagerForm: React.FC<AreaManagerFormProps> = ({ onSubmit, loading }) => {
  const [managerId, setManagerId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [alternateMobile, setAlternateMobile] = useState('');
  const [region, setRegion] = useState('');
  const [cities, setCities] = useState('');
  const [postalCodes, setPostalCodes] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [userId, setUserId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      manager_id: managerId,
      name,
      email,
      mobile,
      alternate_mobile: alternateMobile,
      region,
      cities: cities.split(',').map(c => c.trim()).filter(Boolean),
      postal_codes: postalCodes.split(',').map(p => p.trim()).filter(Boolean),
      status,
      user_id: userId ? parseInt(userId, 10) : null,
    });
  };

  return (
    <form className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white rounded shadow-md" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Manager ID"
        value={managerId}
        onChange={e => setManagerId(e.target.value)}
        required
        className="border rounded px-2 py-1 text-sm"
      />
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={e => setName(e.target.value)}
        required
        className="border rounded px-2 py-1 text-sm"
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        className="border rounded px-2 py-1 text-sm"
      />
      <input
        type="text"
        placeholder="Mobile"
        value={mobile}
        onChange={e => setMobile(e.target.value)}
        required
        className="border rounded px-2 py-1 text-sm"
      />
      <input
        type="text"
        placeholder="Alternate Mobile"
        value={alternateMobile}
        onChange={e => setAlternateMobile(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      />
      <input
        type="text"
        placeholder="Region"
        value={region}
        onChange={e => setRegion(e.target.value)}
        required
        className="border rounded px-2 py-1 text-sm"
      />
      <input
        type="text"
        placeholder="Cities (comma separated)"
        value={cities}
        onChange={e => setCities(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      />
      <input
        type="text"
        placeholder="Postal Codes (comma separated)"
        value={postalCodes}
        onChange={e => setPostalCodes(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      />
      <select
        value={status}
        onChange={e => setStatus(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      >
        <option value="ACTIVE">ACTIVE</option>
        <option value="INACTIVE">INACTIVE</option>
      </select>
      <input
        type="number"
        placeholder="User ID (optional)"
        value={userId}
        onChange={e => setUserId(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={loading}
        className="col-span-1 md:col-span-2 bg-blue-600 text-white rounded px-4 py-2 text-sm font-semibold mt-2"
      >
        {loading ? 'Saving...' : 'Register Area Manager'}
      </button>
    </form>
  );
};

export default AreaManagerForm;
