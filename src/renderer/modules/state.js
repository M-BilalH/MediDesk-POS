/**
 * MediDesk POS - Shared Global Application State
 * Declares all shared global variables and pagination constants.
 */

let currentUser = null;
let enteredPin = '';
let settings = {};
let productsList = [];
let categoriesList = [];
let suppliersList = [];
let customersList = [];
let cart = [];
let cartPrescriptionPath = '';
let parkedOrders = [];
let activeRxSaleId = null;
let activePreviewSaleId = null;
let isCheckoutInProgress = false;
let quoteItems = [];

// Client-Side Pagination Constants & State
let invCurrentPage = 1;
const INV_PAGE_SIZE = 25;
let salesCurrentPage = 1;
const SALES_PAGE_SIZE = 25;
let khataCurrentPage = 1;
const KHATA_PAGE_SIZE = 25;
