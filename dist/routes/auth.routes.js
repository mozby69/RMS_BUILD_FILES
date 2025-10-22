"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware"); // 👈 import middleware
const request_controller_1 = require("../controllers/request/request.controller");
const form_controller_1 = require("../controllers/request/form.controller");
const upload_middleware_1 = require("../middleware/upload.middleware");
const fund_controller_1 = require("../controllers/request/fund.controller");
const stated_controller_1 = require("../controllers/request/stated.controller");
const dashboard_controller_1 = require("../controllers/request/dashboard.controller");
const smsgateway_controller_1 = require("../controllers/smsgateway.controller");
const router = (0, express_1.Router)();
router.post('/register', upload_middleware_1.upload.single('signature'), auth_controller_1.register);
router.put('/request/update-user/:id', auth_middleware_1.authenticate, auth_controller_1.updateUser);
router.delete("/request/delete-user/:id", auth_middleware_1.authenticate, auth_controller_1.deleteUser);
router.post('/login', auth_controller_1.login);
router.get('/me', auth_middleware_1.authenticate, auth_controller_1.me);
router.post('/logout', auth_middleware_1.authenticate, auth_controller_1.logout);
router.put('/user/:id/sms-notification', auth_middleware_1.authenticate, request_controller_1.updateSmsNotification);
//SMS-Gateway
router.post('/sms-send/', smsgateway_controller_1.sendSMS);
//User Route
router.get('/users', auth_middleware_1.authenticate, auth_controller_1.listUsers);
// Request Router 
// router.post('/request/add-checker', authenticate, addChecker)
// router.get('/request/fetch-checker', authenticate, fetchChecker)
// router.delete('/request/checker/:id', authenticate, deleteChecker);
// router.put("/request/checker/:id",authenticate,  updateChecker); 
//Branch Router
router.post('/request/add-branch', auth_middleware_1.authenticate, request_controller_1.addBranch);
router.get('/request/fetch-branch', auth_middleware_1.authenticate, request_controller_1.fetchBranches);
router.put("/request/update-branch/:id", auth_middleware_1.authenticate, request_controller_1.updateBranch);
router.delete("/request/delete-branch/:id", auth_middleware_1.authenticate, request_controller_1.deleteBranch);
//Request type
router.post('/request/add-request-type/', auth_middleware_1.authenticate, request_controller_1.addRequestType);
router.get('/request/list-request-type/', auth_middleware_1.authenticate, request_controller_1.fetchListRequestTypes);
router.delete("/request/delete-request-type/:id", auth_middleware_1.authenticate, request_controller_1.deleteRequestType);
router.put("/request/update-request/:id", auth_middleware_1.authenticate, request_controller_1.updateRequestType);
router.get('/request/fetch-coordinator-report', auth_middleware_1.authenticate, request_controller_1.getCoordinatorDailyReport);
//Form  
router.post('/request/add-fund-transfer/', auth_middleware_1.authenticate, form_controller_1.addFundTransfer);
// router.get('/request/get-request-approver/', authenticate, getRequestsForApprover);
router.get('/request/get-request-action/', auth_middleware_1.authenticate, form_controller_1.getRequestsByUserStatus);
// router.get('/request/get-filter-request/', authenticate, getFilterRequest);
router.patch('/request/:id/action/', auth_middleware_1.authenticate, form_controller_1.approveRequest);
router.post('/add-travel-form', auth_middleware_1.authenticate, form_controller_1.saveTravelOrderForm);
router.post('/add-proposed-budget', auth_middleware_1.authenticate, form_controller_1.saveProposeBudgetForm);
router.post('/add-transmittal-memo', auth_middleware_1.authenticate, form_controller_1.saveTransmittalMemo);
//Header
router.get('/request/user-logs', auth_middleware_1.authenticate, request_controller_1.fetchUserLogs);
router.get('/request/user-notification', auth_middleware_1.authenticate, request_controller_1.fetchUserNotification);
router.put('/request/read-notification/:id', auth_middleware_1.authenticate, request_controller_1.readNotification);
router.put('/request/read-all-notification', auth_middleware_1.authenticate, request_controller_1.readAllNotification);
router.post('/add-OSRequisition', auth_middleware_1.authenticate, form_controller_1.saveOSRequisition);
router.post('/add-FFEPurchasing', auth_middleware_1.authenticate, form_controller_1.saveFFEPurchasing);
router.post('/add-pre-sign', auth_middleware_1.authenticate, form_controller_1.savePreSign);
router.post('/add-past-due-endorsement', auth_middleware_1.authenticate, form_controller_1.savePastDueEndorsement);
router.post('/add-fsm-travel-liquidation', auth_middleware_1.authenticate, form_controller_1.saveFSMTravelLiquidation);
router.post('/add-weekly-itinerary-deviation', auth_middleware_1.authenticate, form_controller_1.saveWeeklyItineraryDeviation);
router.post('/add-fsm-itinerary', auth_middleware_1.authenticate, form_controller_1.saveFMSItinerary);
router.post('/add-travel-order-liquidation', auth_middleware_1.authenticate, form_controller_1.saveTravelOrderLiquidation);
router.get("/fetch-branch-doc-num/:id", auth_middleware_1.authenticate, request_controller_1.fetchBranchDocumentNumber);
router.post('/add-OSPurchasing', auth_middleware_1.authenticate, form_controller_1.saveOSPurchasing);
router.post('/request/save-supplier', auth_middleware_1.authenticate, request_controller_1.saveNewSupplier);
router.get('/request/fetch-suppliers/:id', auth_middleware_1.authenticate, request_controller_1.fetchBranchSuppliers);
//CountSheet
router.post('/request/add-count-sheet', auth_middleware_1.authenticate, fund_controller_1.createFund);
//AsStated
router.post("/request/add-as-stated", auth_middleware_1.authenticate, upload_middleware_1.uploadAsStated.array("images", 50), stated_controller_1.CreateAsStated);
router.get("/status-summary", dashboard_controller_1.getRequestStatus);
router.get("/daily-trend", dashboard_controller_1.getRequestCountByDate);
router.get("/volume-heatmap", dashboard_controller_1.getRequestVolumeByBranchAndType);
router.get("/requests-by-category", dashboard_controller_1.getRequestsByCategory);
exports.default = router;
