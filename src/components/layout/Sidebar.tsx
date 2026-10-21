import React, { useState } from 'react';
import {
  Users, Building2, Ship, MapPin, Coins, Receipt, LayoutDashboard,
  FileQuestion, FileSpreadsheet, FolderKanban, CheckSquare, ArrowDownToLine,
  ArrowUpFromLine, FileText, ChevronRight, ChevronDown, CircleDollarSign, CreditCard,
  ClipboardCheck, Calculator, Handshake
} from 'lucide-react';
import { UserRole, ActiveTab } from '../../types';
import { formatDateLong } from '../../utils/date';

interface SidebarProps {
  currentRole: UserRole;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  selectedJobId: string;
  mobileOpen?: boolean;
}

type NavItem = { label:string; tab:ActiveTab; icon:any };

export const Sidebar: React.FC<SidebarProps> = ({currentRole,activeTab,onSelectTab,selectedJobId,mobileOpen=false}) => {
  const [quotesOpen,setQuotesOpen]=useState(true);
  const [accountsReceivableOpen,setAccountsReceivableOpen]=useState(false);
  const [accountsPayableOpen,setAccountsPayableOpen]=useState(false);
  const [financePaymentOpen,setFinancePaymentOpen]=useState(false);

  const item=(x:NavItem) => {
    const Icon = x.icon;
    return (
      <button key={x.label} className={`maritim-nav-item ${activeTab===x.tab?'active':''}`} onClick={()=>onSelectTab(x.tab)}>
        <Icon/><span>{x.label}</span>
      </button>
    );
  };

  const roleTitle =
    currentRole==='ADMIN'?'ADMINISTRATION':
    currentRole==='SALES'?'SALES WORKSPACE':
    currentRole==='MANAGER_OPS'?'OPERATIONS MANAGER':
    currentRole==='FDA'?'FDA & DISBURSEMENT':'FINANCE & ACCOUNTS';

  const roleDesc =
    currentRole==='ADMIN'?'Master data, users & system control':
    currentRole==='SALES'?'Inquiry, quotation & vessel jobs':
    currentRole==='MANAGER_OPS'?'Approval, monitoring & control':
    currentRole==='FDA'?'FDA final, biaya aktual & disbursement':
    'Invoice, AP/AR & job closing';

  return (
    <aside className={`maritim-sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="maritim-sidebar-top">
        <div className="maritim-workspace-label">WORKSPACE</div>
        <div className="maritim-workspace-title">{roleTitle}</div>
        <div className="maritim-workspace-desc">{roleDesc}</div>
      </div>

      <nav className="maritim-nav">
        <div className="maritim-nav-section">Main Menu</div>

        {currentRole==='ADMIN' && <>
          {item({label:'Dashboard',tab:'DASHBOARD',icon:LayoutDashboard})}
          <div className="maritim-nav-group-title"><Building2/><span>Master Data</span></div>
          <div className="maritim-subnav maritim-subnav-static">
            {item({label:'Users',tab:'USERS',icon:Users})}
            {item({label:'Customers',tab:'CUSTOMERS',icon:Building2})}
            {item({label:'Vessels',tab:'VESSELS',icon:Ship})}
            {item({label:'Ports',tab:'PORTS',icon:MapPin})}
            {item({label:'Fix Tariff',tab:'FIX_TARIFF',icon:Coins})}
            {item({label:'Expenses Item',tab:'EXPENSES_ITEM',icon:Receipt})}
            {item({label:'Vendor Patners',tab:'VENDOR_PARTNERS',icon:Handshake})}
            {item({label:'Bank Account',tab:'BANK_ACCOUNT',icon:Building2})}
          </div>
          {item({label:'Monitoring Vessel Calls',tab:'ACTIVE_VESSEL_CALLS',icon:Ship})}
        </>}

        {currentRole==='SALES' && <>
          {item({label:'Dashboard',tab:'DASHBOARD',icon:LayoutDashboard})}
          {item({label:'Inquiries',tab:'INQUIRIES',icon:FileQuestion})}
          {item({label:'Quotes',tab:'QUOTES_EPDA',icon:FileSpreadsheet})}
          {item({label:'Monitoring Vessel Calls',tab:'ACTIVE_VESSEL_CALLS',icon:Ship})}
        </>}

        {currentRole==='MANAGER_OPS' && <>
          {item({label:'Dashboard',tab:'DASHBOARD',icon:LayoutDashboard})}
          {item({label:'Quotes Review',tab:'QUOTES_VIEW',icon:FileSpreadsheet})}
          {item({label:'Approval Center',tab:'APPROVAL',icon:CheckSquare})}
          {item({label:'Voucher Approval',tab:'MANAGER_VOUCHER_APPROVAL',icon:ClipboardCheck})}
          {item({label:'Management Vessel',tab:'MANAGEMENT_VESSEL',icon:Ship})}
          {item({label:'Monitoring Vessel Calls',tab:'ACTIVE_VESSEL_CALLS',icon:Ship})}
        </>}

        {currentRole==='FDA' && <>
          {item({label:'Dashboard',tab:'DASHBOARD',icon:LayoutDashboard})}
          {item({label:'Inquiries',tab:'FDA_INQUIRIES',icon:FileQuestion})}
          {item({label:'Create FDA',tab:'FDA_QUOTES_EPDA',icon:FileSpreadsheet})}
          <div className="maritim-nav-group-title"><Receipt/><span>Request Payment</span></div>
          <div className="maritim-subnav maritim-subnav-static">
            {item({label:'Created Payment',tab:'FDA_CREATE_VOUCHER',icon:FileText})
}
            {item({label:'Edit Payment',tab:'FDA_EDIT_VOUCHER',icon:FileText})}
            {item({label:'History',tab:'FDA_PAYMENT_HISTORY',icon:ClipboardCheck})}
          </div>
          {item({label:'Monitoring Vessel Calls',tab:'ACTIVE_VESSEL_CALLS',icon:Ship})}
        </>}

        {currentRole==='FINANCE' && <>
          {item({label:'Financial Overview',tab:'FINANCE_DASHBOARD',icon:LayoutDashboard})}
          {item({label:'Rekap Keuangan',tab:'FINANCE_RECAP',icon:Calculator})}
          <button type="button" className="maritim-nav-group-title maritim-nav-group-toggle" aria-expanded={accountsReceivableOpen} onClick={()=>setAccountsReceivableOpen((open)=>!open)}>
            <CircleDollarSign/><span>Accounts Receivable</span>{accountsReceivableOpen?<ChevronDown/>:<ChevronRight/>}
          </button>
          {accountsReceivableOpen && <div className="maritim-subnav maritim-subnav-static">
            {item({label:'Input Receivable',tab:'FINANCE_RECEIVABLE_INPUT',icon:FileText})}
            {item({label:'History Receivable',tab:'FINANCE_RECEIVABLE_HISTORY',icon:ClipboardCheck})}
          </div>}
          <button type="button" className="maritim-nav-group-title maritim-nav-group-toggle" aria-expanded={accountsPayableOpen} onClick={()=>setAccountsPayableOpen((open)=>!open)}>
            <ArrowUpFromLine/><span>Accounts Payable</span>{accountsPayableOpen?<ChevronDown/>:<ChevronRight/>}
          </button>
          {accountsPayableOpen && <div className="maritim-subnav maritim-subnav-static">
            {item({label:'Input Payable',tab:'FINANCE_ACCOUNTS_PAYABLE_INPUT',icon:FileText})}
            {item({label:'View Payable',tab:'FINANCE_ACCOUNTS_PAYABLE_HISTORY',icon:ClipboardCheck})}
            {item({label:'History Payable',tab:'FINANCE_HISTORY_REPORT',icon:FileSpreadsheet})}
          </div>}
          <button type="button" className="maritim-nav-group-title maritim-nav-group-toggle" aria-expanded={financePaymentOpen} onClick={()=>setFinancePaymentOpen((open)=>!open)}>
            <CreditCard/><span>Request Payment</span>{financePaymentOpen?<ChevronDown/>:<ChevronRight/>}
          </button>
          {financePaymentOpen && <div className="maritim-subnav maritim-subnav-static">
            {item({label:'Created Payment',tab:'FINANCE_CREATE_VOUCHER',icon:FileText})}
            {item({label:'Edit Payment',tab:'FINANCE_EDIT_VOUCHER',icon:FileText})}
            {item({label:'History',tab:'FINANCE_PAYMENT_HISTORY',icon:ClipboardCheck})}
          </div>}
          {item({label:'JOB Invoice',tab:'JOB_INVOICE_OPEN',icon:FileText})}
          {item({label:'JOB Closing',tab:'CLOSING',icon:CheckSquare})}
          {item({label:'Monitoring Vessel Calls',tab:'ACTIVE_VESSEL_CALLS',icon:Ship})}
        </>}

      </nav>

      <div className="maritim-sidebar-bottom">
        <div className="maritim-today-card">
          <div className="maritim-today-label">TODAY</div>
          <div className="maritim-today-date">
            {formatDateLong()}
          </div>
        </div>
      </div>
    </aside>
  );
};
