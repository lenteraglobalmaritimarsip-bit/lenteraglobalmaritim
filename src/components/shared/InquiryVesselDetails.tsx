import React from 'react';
import { Customer, PurposeOfCall, User, Vessel, formatPurposeOfCall } from '../../types';
import { formatDateDisplay, formatInquiryDate } from '../../utils/date';

interface Props {
  inquiryNo?: string;
  inquiryDate?: string;
  dateLabel?: string;
  quoteDate?: string;
  status?: string;
  branch?: string;
  createdBy?: string;
  vesselName?: string;
  vessel?: Vessel;
  eta?: string;
  etd?: string;
  etaRemarks?: string;
  etdRemarks?: string;
  cargoQuantity?: number;
  quantityUnit?: 'MT' | 'TON';
  purposeOfCall?: PurposeOfCall;
  portName?: string;
  estimatedDays?: number;
  cargoDetails?: string;
  specialRequirements?: string;
  fdaNo?: string;
  fdaDate?: string;
  vesselCallStatus?: string;
  loa?: number;
  beam?: number;
  customer?: Customer;
  recipient?: User;
}

const valueOrDash = (value?: string | number | null) =>
  value === undefined || value === null || String(value).trim() === '' ? '-' : String(value);

const vesselDate = (value?: string) => value ? formatDateDisplay(value, true) : '-';

const detailRows = (rows: Array<[string, React.ReactNode]>) => rows.map(([label, value]) => (
  <div key={label} className="inquiry-vessel-detail-row">
    <span>{label}</span><span className="inquiry-vessel-colon">:</span><strong>{value}</strong>
  </div>
));

export const InquiryVesselDetails: React.FC<Props> = ({
  inquiryNo,
  inquiryDate,
  dateLabel = 'Date Quotes',
  quoteDate,
  status,
  branch,
  createdBy,
  vesselName,
  vessel,
  eta,
  etd,
  etaRemarks,
  etdRemarks,
  cargoQuantity,
  quantityUnit = 'TON',
  purposeOfCall,
  portName,
  estimatedDays,
  cargoDetails,
  specialRequirements,
  fdaNo,
  fdaDate,
  vesselCallStatus,
  loa,
  beam,
  customer,
  recipient,
}) => (
  <section className="inquiry-vessel-details">
    <header className="inquiry-vessel-details-header">
      <div>
        <div className="inquiry-vessel-eyebrow">Inquiry Vessel Details</div>
        <h2>Informasi Lengkap Inquiry Vessel</h2>
        <p>Status: {valueOrDash(status)} · Branch: {valueOrDash(branch || recipient?.branch)} · Dibuat oleh: {valueOrDash(createdBy || recipient?.name)}</p>
      </div>
      <div className="inquiry-vessel-reference">
        <div><span>No Inquiry</span><strong>{valueOrDash(inquiryNo)}</strong></div>
        <div><span>{dateLabel}</span><strong>{valueOrDash(quoteDate ? formatInquiryDate(quoteDate) : inquiryDate ? formatInquiryDate(inquiryDate) : '')}</strong></div>
      </div>
    </header>

    <div className="inquiry-vessel-main">
      <div>{detailRows([
        ['Vessel', valueOrDash(vesselName || vessel?.name)],
        ['IMO', valueOrDash(vessel?.imoNumber)],
        ['Call Sign', valueOrDash(vessel?.callSign)],
        ['Flag', valueOrDash(vessel?.flag)],
        ['Cargo Quantity', `${cargoQuantity || 0} ${quantityUnit}`],
        ['Gross (GRT)', valueOrDash(vessel?.grt?.toLocaleString('en-US'))],
        ['Net (NRT)', valueOrDash(vessel?.nrt?.toLocaleString('en-US'))],
        ['DWT', valueOrDash(vessel?.dwt?.toLocaleString('en-US'))],
      ])}</div>
      <div>{detailRows([
        ['ETA', vesselDate(eta)],
        ['ETD', vesselDate(etd)],
        ['Keterangan ETA', valueOrDash(etaRemarks)],
        ['Keterangan ETD', valueOrDash(etdRemarks)],
        ['Purpose', formatPurposeOfCall(purposeOfCall)],
        ['Port', valueOrDash(portName)],
        ['Estimated Days', `${estimatedDays || 0} hari`],
        ['Cargo Details', valueOrDash(cargoDetails)],
        ['Vessel Type', valueOrDash(vessel?.vesselType)],
        ['Special Requirements', valueOrDash(specialRequirements)],
        ...(fdaNo !== undefined ? [['FDA No.', valueOrDash(fdaNo)] as [string, React.ReactNode]] : []),
        ...(fdaDate !== undefined ? [['FDA Date', vesselDate(fdaDate)] as [string, React.ReactNode]] : []),
        ...(vesselCallStatus !== undefined ? [['Status Vessel Call', valueOrDash(vesselCallStatus)] as [string, React.ReactNode]] : []),
        ...(loa !== undefined || beam !== undefined ? [['LOA / Beam', `${valueOrDash(loa)} m / ${valueOrDash(beam)} m`] as [string, React.ReactNode]] : []),
      ])}</div>
    </div>

    <div className="inquiry-vessel-contacts">
      <section>
        <h3>Penerima Vessel Call</h3>
        <div>{detailRows([
          ['Nama', valueOrDash(recipient?.name || createdBy)],
          ['Alamat', '-'],
          ['Email', valueOrDash(recipient?.email)],
          ['Contact Person', valueOrDash(recipient?.position || recipient?.name || createdBy)],
          ['No Telepon', valueOrDash(recipient?.phone)],
        ])}</div>
      </section>
      <section>
        <h3>Pemberi Vessel Call</h3>
        <div>{detailRows([
          ['Nama', valueOrDash(customer?.companyName)],
          ['Alamat', valueOrDash(customer?.address)],
          ['Email', valueOrDash(customer?.email)],
          ['Contact Person', valueOrDash(customer?.contactPerson)],
          ['No Telepon', valueOrDash(customer?.phone)],
        ])}</div>
      </section>
    </div>
  </section>
);
