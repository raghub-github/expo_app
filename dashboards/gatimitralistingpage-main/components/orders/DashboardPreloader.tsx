import React from 'react';

interface DashboardPreloaderProps {
	dashboardName: string;
	isVisible: boolean;
}

const DashboardPreloader: React.FC<DashboardPreloaderProps> = ({ dashboardName, isVisible }) => {
	if (!isVisible) return null;
	return (
		<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50">
			<div className="bg-white p-8 rounded-lg shadow-lg flex flex-col items-center">
				<div className="loader mb-4" />
				<p className="text-lg font-semibold text-gray-700 mb-2">Loading {dashboardName} Dashboard...</p>
			</div>
		</div>
	);
};

export default DashboardPreloader;
