console.debug('scripts.js loaded');

// Detect a true browser reload and return user to chooser, unless an allow flag is set
try {
    let isReload = false;
    try {
        const navEntries = performance.getEntriesByType && performance.getEntriesByType('navigation');
        if (navEntries && navEntries.length && navEntries[0].type) {
            isReload = navEntries[0].type === 'reload';
        } else if (performance.navigation && typeof performance.navigation.type === 'number') {
            isReload = performance.navigation.type === performance.navigation.TYPE_RELOAD;
        }
    } catch (e) {
        // ignore
    }

    if (isReload) {
        // If an intentional navigation set an allow flag, consume it and do not redirect —
        // but only if the flag is recent. This prevents stale localStorage flags from
        // suppressing the chooser redirect on later reloads.
        const allowVal = localStorage.getItem('allowStepper');
        let allowRecent = false;
        if (allowVal) {
            const ts = parseInt(allowVal, 10);
            if (!isNaN(ts) && (Date.now() - ts) < 5000) allowRecent = true; // 5s window
        }

        if (allowRecent) {
            try { localStorage.removeItem('allowStepper'); } catch (e) {}
            console.debug('Reload detected but recent allowStepper flag present — skipping chooser redirect');
        } else {
            // Either no flag or stale flag: remove stale flag and redirect when appropriate
            try { localStorage.removeItem('allowStepper'); } catch (e) {}
            const path = (location.pathname || '').split('/').pop() || '';
            const exempt = ['chooser.html', 'confirmation.html'];
            if (!exempt.includes(path)) {
                try { sessionStorage.clear(); } catch (e) {}
                window.location.href = 'chooser.html';
            } else {
                try { sessionStorage.clear(); } catch (e) {}
            }
        }
    }
} catch (e) {
    console.warn('Reload detection failed', e);
}

class Stepper {
    constructor(stepSelector) {
        this.steps = Array.from(document.querySelectorAll(stepSelector));
        this.activeStep = this.steps.find(step => step.classList.contains('active'));
        this.observeStepContentChanges();

        this.stepHandlers = {}; // Store step instances
        this.updateStepNumbers();
        this.customStepCode(this.steps.indexOf(this.activeStep))

    }

    adjustMaxHeight(step) {
        if (!step) return;
        const stepContent = step.querySelector('.step-content');
        if (stepContent) {
            stepContent.style.maxHeight = stepContent.scrollHeight + 'px';
        }
    }

    setActive(step) {
        if (!step) return;

        if (this.activeStep) {

            this.activeStep.classList.remove('active');
            const stepContent = this.activeStep.querySelector('.step-content');
            if (stepContent) {
                stepContent.style.maxHeight = null;
            }
        }

        step.classList.add('active');
        this.activeStep = step;

        this.updateStepNumbers();
        this.customStepCode(this.steps.indexOf(this.activeStep))

        //this.adjustMaxHeight(step); //hiding this fixed the accordion issue, unknown other effects/imapcts though
    }

    updateStepNumbers() {
        this.steps.forEach((step, index) => {
            let stepNumberElement = step.querySelector('.step-number');
            if (!stepNumberElement) return;

            const isActive = step === this.activeStep;
            const isCompleted = index < this.steps.indexOf(this.activeStep);

            this.styleStepNumber(stepNumberElement, index, isActive, isCompleted);
        });
    }


    styleStepNumber(element, index, isActive, isCompleted) {
        element.style.backgroundColor = isActive || isCompleted ? "#1C578A" : "#757575";
        element.style.color = "#FFFFFF";

        if (index === 0 && !isCompleted) {
            // First step gets the 'info' icon
            element.innerHTML = `<strong>i</strong>`;
        } else {
            // Other steps display their number
            element.innerHTML = isCompleted ? `<span class="material-icons">check</span>` : `${index}`;
        }
    }

    observeStepContentChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === "childList") {
                    this.adjustMaxHeight(this.activeStep); // ✅ Auto-adjust height when new elements are added
                }
            });
        });

        this.steps.forEach(step => {
            const stepContent = step.querySelector('.step-content');
            if (stepContent) {
                observer.observe(stepContent, {
                    childList: true,
                    subtree: true
                });
            }
        });
    }

    navigateStep(direction) {
        const currentIndex = this.steps.indexOf(this.activeStep);
        const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

        if (targetIndex >= 0 && targetIndex < this.steps.length) {
            this.storeData(currentIndex);
            this.setActive(this.steps[targetIndex]);
        }
    }

    storeData(stepNum) {
        const stepForm = document.querySelector(`#step-${stepNum}-form`);
        let dataObj = {};
        const checkArr = [];

        if (stepForm) {
            const allInputs = stepForm.querySelectorAll("input, select, textarea");
            allInputs.forEach(input => {
                if (input.closest('.hidden')) return;

                const name = input.name;
                if(!name) return;

                if(input.dataset.array === "true") {
                    if (!dataObj[name]) dataObj[name] = [];
                        if (input.value !== "") 
                            dataObj[name].push(input.value);
                }
                
                else {
                    if (input.type === "radio") {
                        if (input.checked) {
                            dataObj[input.name] = input.value;
                        }
                    } else if (input.type === "checkbox") {
                        if (input.checked) {
                            checkArr.push(input.value);
                            dataObj[input.name] = checkArr;
                        }
                    } else {
                        dataObj[input.name] = input.value;
                    }
                }
                
            });
            
            Object.keys(dataObj).forEach(k => {
                if (Array.isArray(dataObj[k]) && dataObj[k].length === 0) {
                    delete dataObj[k];
                }
                });

        }

        // Step 2 special: include tax lines table
        if (stepNum === 2) {
            if(this.stepHandlers[2]?.taxLinesTable) {
                dataObj["s2q5"] = this.stepHandlers[2].taxLinesTable.rows;
            }
            
        }

        if (stepNum === 5) {
            const currentDocuments = this.stepHandlers[5]?.documentsTable?.rows || [];
            const savedDocuments = Array.from(document.querySelectorAll('#pastsesh-upload-tb tbody tr'))
                .filter(row => !row.classList.contains('no-docs-row') && row.cells.length >= 4)
                .map(row => ({
                    "s5-filename": row.cells[0].textContent.trim(),
                    "s5-desc": row.cells[1].textContent.trim(),
                    "s5-date": row.cells[2].textContent.trim(),
                    "s5-size": row.cells[3].textContent.trim()
                }));
            dataObj.documents = currentDocuments.map(document => ({
                ...document,
                "s5-date": document["s5-date"] || ""
            })).concat(savedDocuments);
        }
    
            

        DataManager.saveData(`stepData_${stepNum}`, dataObj);
    }


    loadStoredData() {
        this.steps.forEach((step, index) => {
            let savedData = DataManager.getData(`stepData_${index}`);
            if (!savedData) return;

            Object.keys(savedData).forEach(key => {
                let input = step.querySelector(`[name="${key}"]`);
                if (input) {
                    if (input.type === "radio" || input.type === "checkbox") {
                        if (input.value === savedData[key]) {
                            input.checked = true;
                        }
                    } else {
                        input.value = savedData[key];
                    }
                }
            });
        });
    }

    customStepCode(stepNum) {
        if (!this.stepHandlers[stepNum]) {
            switch (stepNum) {
                case 1:
                    this.stepHandlers[stepNum] = new Step1Handler();
                    break;
                case 2:
                    this.stepHandlers[stepNum] = new Step2Handler();
                    break;
                case 3:
                    this.stepHandlers[stepNum] = new Step3Handler(this);
                    break;
                case 5:
                this.stepHandlers[stepNum] = new Step5Handler(this);
                break;
                case 6:
                    this.stepHandlers[stepNum] = new Step4Handler(this);
                    break;

            }
        }
    
          

        
 

    }
}


class Step1Handler {
    constructor() {
        this.accountInfoPanelContainer = document.getElementById("accountinfo-panel-container");
        this.accountInfo = DataManager.getData("accountInfo") || null;
        this.anticipatedDate = new DatepickerObj("startDate");
        this.populateInfoPanel();
        
    }
    populateInfoPanel(){
        
        new PanelObj({
            container: this.accountInfoPanelContainer,
            title: "Information on file",
            data: this.accountInfo,
            editButton: false, 
            editIndex: null,
            reviewPanel: false,
            labels: ["Business number", "Business name", "Telephone number"]
        })
    
    }
    

}
class Step2Handler {
    constructor() {
      
        
    }
   

}
class Step3Handler {
    constructor() {
       

    }
   

}

class Step4Handler {
    constructor(stepper) {
        this.stepper = stepper;
        this.reviewContainer = document.getElementById("review-container");
        this.populateReview();

        // Listen for navigation events
        document.addEventListener("navigateToStep", (event) => {
            this.stepper.setActive(this.stepper.steps[event.detail.index]);
        });


    }

    populateReview() {
        this.reviewContainer.innerHTML = ""; // Clear previous content

        const steps = [{
                stepNum: 1,
                title: "General information",
                storageKey: "stepData_1"
            },
            {
                stepNum: 2,
                title: "Describe the problem or uncertainty",
                storageKey: "stepData_2"

            },
             {
                stepNum: 3,
                title: "Describe the existing knowledge",
                storageKey: "stepData_3"

            }
            ,{
                stepNum: 4,
                title: "Describe the planned work",
                storageKey: "stepData_4"
            },
            {
                stepNum: 5,
                title: "Supporting documents",
                storageKey: "stepData_5",
                documents: true
            }
        ];
        steps.forEach(({ stepNum, title, storageKey, documents }) => {
            let data = DataManager.getData(storageKey);
            if (!data) return; 

            // Replace field names with question labels
            let formattedData = {};
            let subTableData = null; // Placeholder for subtable

            if (documents) {
                const rows = data.documents || [];
                subTableData = {
                    title: "Attached documents",
                    headers: ["File name", "Description", "Date uploaded", "File size"],
                    columns: ["s5-filename", "s5-desc", "s5-date", "s5-size"],
                    rows: rows.length > 0 ? rows : [{
                        "s5-filename": "No supporting documents attached.",
                        "s5-desc": "",
                        "s5-date": "",
                        "s5-size": ""
                    }]
                };
            }
            

            Object.keys(data).forEach(key => {
                if (key === "documents") return;
                let value = data[key];
                if (value == null) return;

                if (key === "fieldofSci-field") {
                    const selectedOption = Array.from(document.querySelectorAll("#fieldofSci-field option"))
                        .find(option => option.value === value);
                    value = selectedOption?.textContent || value;
                }

            
                // Use proper labels
                const label = this.getLabelForInput(key);
                formattedData[label] = value;
            });
            new PanelObj({
                container: this.reviewContainer,
                title: title,
                data: formattedData, // Use the formatted data with proper labels
                editButton: true,
                editIndex: stepNum,
                reviewPanel: true,
                subTable: subTableData
            });
        });

        // Listen for edit button clicks
        document.addEventListener("editPanelEvent", (event) => {
            this.stepper.setActive(this.stepper.steps[event.detail.index]);
        });
    }

    formatDate(value) {
        if (!value)
            return "N/A";

        const localDate = this.parseLocalDate(value);
        if (!localDate || isNaN(localDate))
            return value;

        return localDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric"
        });
    }

    parseLocalDate(value) {
        if (!value) {
            return null;
        }

        const isoMatch = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
        if (isoMatch) {
            return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
        }

        const date = new Date(value);
        return isNaN(date) ? null : date;
    }


    getLabelForInput(name) {
        let label = "";

        const namedInput = document.querySelector(`[name="${name}"]`);
        const inputFieldset = namedInput?.closest("fieldset");
        const inputLegend = inputFieldset?.querySelector("legend");
        if (inputLegend) {
            label = inputLegend.textContent.trim();
        }

        // Handle standard <label for="...">
        const input = namedInput;
        if (input) {
            const labelElement = document.querySelector(`label[for="${input.id}"]`);
            if (labelElement) {
                const cloned = labelElement.cloneNode(true);
                // Remove help links/icons and asterisks
                cloned.querySelectorAll('a, span, .label-ast').forEach(el => el.remove());
                label = cloned.textContent.trim();
            }
        }

        // Handle radio/checkbox inside a <fieldset>
        const fieldset = document.querySelector(`fieldset [name="${name}"]`);
        if (fieldset) {
            const legend = fieldset.closest("fieldset").querySelector("legend");
            if (legend) {
                const cloned = legend.cloneNode(true);
                // Remove help links/icons and asterisks
                cloned.querySelectorAll('a, span, .label-ast').forEach(el => el.remove());
                label = cloned.textContent.trim();
            }
        }

        // Final cleanup: remove any leftover asterisks or whitespace
        return label.replace(/^\*\s*/, "").trim() || name;
    }


}

class Step5Handler {
    constructor() {
        //this.tempData = null; // Temporary storage for lightbox data
        this.documentsTable = new TableObj("currentsesh-upload-tb");
        this.uploadDocLightbox = new FormLightbox(document.getElementById("uploaddoc-lightbox"));

        this.browseFileButton = document.getElementById("s5-browsebtn");
        this.browseWindow = document.getElementById("s5-browsewind");
        this.fileListContainer = document.getElementById("document-file-list");
        this.fileList = [];

        this.fileNameDisplay = document.getElementById("s5-filename-display");
        this.hiddenFileInput = document.getElementById("s5-filename");
        this.hiddenFileSize = document.getElementById("s5-size");
        

        if(!this.browseFileButton) return; 

        this.populateTaskDocumentList();

        this.browseFileButton.addEventListener("click", () => {
            this.browseWindow.classList.remove('hidden');
            //this.selectFile();
        });

        document.addEventListener("lightboxSubmitted", (event) => {
            if (event.detail.lightboxId === "uploaddoc-lightbox") {
                this.handleFormSubmit(event.detail.formData);
            }
        });
        // Listen for edit events
        document.addEventListener("editRowEvent", (event) => {
            if (event.detail.tableID === "tb-upload-doc") {
                this.openEditLightbox(event.detail.index, event.detail.rowData);
            }
        });
        document.addEventListener("fileSizeUpdated", () => {
            this.calculateTotalFileSize();
        });
        document.addEventListener("rowDeleted", () => {
            this.calculateTotalFileSize();
        });
        

        this.calculateTotalFileSize();
    }

    populateTaskDocumentList() {
        const selectedTask = JSON.parse(sessionStorage.getItem("selectedTask") || localStorage.getItem("selectedTask") || "{}");
        const documentOptions = selectedTask.supportingDocuments || [];

        if (!this.fileListContainer) return;

        this.fileListContainer.innerHTML = "";
        this.fileList = [];

        documentOptions.forEach((fileName) => {
            const fileItem = document.createElement("li");
            fileItem.className = "file-item";
            fileItem.dataset.fileName = fileName;
            fileItem.innerHTML = '<span class="material-icons file-icon">insert_drive_file</span>' + fileName;
            fileItem.addEventListener("click", () => {
                this.selectFile(fileItem);
                this.browseWindow.classList.add("hidden");
            });
            this.fileListContainer.appendChild(fileItem);
            this.fileList.push(fileItem);
        });
    }

    selectFile(file){
        const fileName = file.dataset.fileName || file.textContent.trim();
        this.fileNameDisplay.textContent = fileName;
        this.hiddenFileInput.value = fileName;
        const fakeSize = Math.floor(Math.random() * 450) + 50; // Generates 50-500 KB
        this.hiddenFileSize.value = fakeSize; // Store size as a number
        
    }

    openEditLightbox(index, rowData) {
       
        // Set the index of the row being edited
        this.uploadDocLightbox.setEditIndex(index);

        // Fill form with existing row data
        this.uploadDocLightbox.populateForm(rowData);
         // Manually update filename span
        if (rowData["s5-filename"]) {
            const filenameDisplay = document.getElementById("s5-filename-display");
        if (filenameDisplay) {
            filenameDisplay.textContent = rowData["s5-filename"];
        }
    }

        // Open the lightbox
        this.uploadDocLightbox.openLightbox();
    }

    handleFormSubmit(formData) {
        const editIndex = this.uploadDocLightbox.getEditIndex();
        

        let fileSize = parseInt(formData["s5-size"], 10) || 0;
        formData["s5-size"] = fileSize < 1024 ? `${fileSize} KB` : `${(fileSize / 1024).toFixed(2)} MB`;
    
        if (editIndex !== null && editIndex !== undefined && editIndex !== "") {
            this.documentsTable.rows[editIndex] = formData;
            this.uploadDocLightbox.clearEditIndex();
            this.documentsTable.refreshTable();
        } else {
            this.documentsTable.addRow(formData);
          
        }       
        document.dispatchEvent(new Event("fileSizeUpdated")); // Notify that the file size changed

    }

    calculateTotalFileSize() {
        let totalSize = this.documentsTable.rows.reduce((sum, row) => {
            let size = parseInt(row["s5-size"], 10) || 0; // Ensure size is numeric
            return sum + size;
        }, 0);
    
        let displaySize;
        if (totalSize < 1024) {
            displaySize = `${totalSize} KB`; // Keep KB format
        } else {
            displaySize = `${(totalSize / 1024).toFixed(2)} MB`; // Convert to MB with two decimals
        }
    
        document.getElementById("uploadedfiles-size").textContent = displaySize;
    }

    
}

class CharacterCounter {
    constructor(textarea, mode = 'chars') {
        this.textarea = textarea;
        this.mode = mode === 'words' ? 'words' : 'chars';
        this.maxLength = parseInt(textarea.dataset.maxlength, 10) || null;

        this.counterEl = document.createElement("div");
        this.counterEl.classList.add("char-counter");

        textarea.insertAdjacentElement("afterend", this.counterEl);

        this.updateCount();

        // Use a bound handler so we can enforce limits on input/paste
        this._boundInputHandler = this.handleInput.bind(this);
        textarea.addEventListener("input", this._boundInputHandler);
        // Prevent further key input when at limit
        this._boundKeydownHandler = this._handleKeydown.bind(this);
        textarea.addEventListener('keydown', this._boundKeydownHandler);
        // Handle paste specially to truncate before insertion
        this._boundPasteHandler = this._handlePaste.bind(this);
        textarea.addEventListener('paste', this._boundPasteHandler);
    }

    _getWordCount() {
        const text = (this.textarea.value || '').trim();
        return text === '' ? 0 : text.split(/\s+/).filter(w => w.length > 0).length;
    }

    _handleKeydown(e) {
        if (!this.maxLength) return;
        // allow modifier combos
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const navKeys = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Tab','Enter'];
        if (navKeys.includes(e.key)) return;

        const selStart = this.textarea.selectionStart;
        const selEnd = this.textarea.selectionEnd;
        const selLen = selEnd - selStart;

        if (this.mode === 'chars') {
            const currLen = this.textarea.value.length;
            // if no selection and already at or over limit, block printable keys
            if (selLen === 0 && currLen >= this.maxLength) {
                e.preventDefault();
            }
            // if replacing selection, allow as long as replacement won't exceed limit
            if (selLen > 0) {
                const allowed = this.maxLength - (currLen - selLen);
                if (allowed <= 0) {
                    e.preventDefault();
                }
            }
        } else {
            // words mode: block if already at max and not replacing selection
            const currWords = this._getWordCount();
            if (selLen === 0 && currWords >= this.maxLength) {
                // block printable characters and space
                if (e.key.length === 1 || e.key === ' ') {
                    e.preventDefault();
                }
            }
        }
    }

    _handlePaste(e) {
        if (!this.maxLength) return;
        const paste = (e.clipboardData || window.clipboardData).getData('text') || '';
        const selStart = this.textarea.selectionStart;
        const selEnd = this.textarea.selectionEnd;
        const selText = this.textarea.value.substring(selStart, selEnd);

        if (this.mode === 'chars') {
            const currLen = this.textarea.value.length;
            const allowed = this.maxLength - (currLen - selText.length);
            if (allowed <= 0) {
                e.preventDefault();
                return;
            }
            if (paste.length > allowed) {
                e.preventDefault();
                const insert = paste.substring(0, allowed);
                this._insertAtSelection(insert);
            }
        } else {
            const pasteWords = paste.trim() === '' ? [] : paste.trim().split(/\s+/).filter(w => w.length > 0);
            const currWords = this._getWordCount();
            const selWords = selText.trim() === '' ? 0 : selText.trim().split(/\s+/).filter(w => w.length > 0).length;
            const allowed = this.maxLength - (currWords - selWords);
            if (allowed <= 0) {
                e.preventDefault();
                return;
            }
            if (pasteWords.length > allowed) {
                e.preventDefault();
                const insert = pasteWords.slice(0, allowed).join(' ');
                this._insertAtSelection(insert);
            }
        }
    }

    _insertAtSelection(insertText) {
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const value = this.textarea.value;
        this.textarea.value = value.slice(0, start) + insertText + value.slice(end);
        const pos = start + insertText.length;
        this.textarea.selectionStart = this.textarea.selectionEnd = pos;
        this.updateCount();
    }

    updateCount() {
        if (this.mode === 'words') {
            const text = (this.textarea.value || '').trim();
            const wordCount = text === '' ? 0 : text.split(/\s+/).filter(w => w.length > 0).length;
            if (this.maxLength) {
                this.counterEl.textContent = `${wordCount} / ${this.maxLength} words`;
            } else {
                this.counterEl.textContent = `${wordCount} words`;
            }
        } else {
            const currentLength = this.textarea.value.length;
            if (this.maxLength) {
                this.counterEl.textContent = `${currentLength} / ${this.maxLength} characters`;
            } else {
                this.counterEl.textContent = `${currentLength} characters`;
            }
        }
        // visual state when at limit
        const reached = this.maxLength && ((this.mode === 'words' && this._getWordCount() >= this.maxLength) || (this.mode === 'chars' && this.textarea.value.length >= this.maxLength));
        if (reached) {
            this.counterEl.classList.add('limit-reached');
            this.textarea.classList.add('limit-reached');
        } else {
            this.counterEl.classList.remove('limit-reached');
            this.textarea.classList.remove('limit-reached');
        }
    }

    handleInput() {
        if (!this.maxLength) {
            this.updateCount();
            return;
        }

        if (this.mode === 'words') {
            const text = (this.textarea.value || '').trim();
            if (text === '') {
                this.updateCount();
                return;
            }
            const words = text.split(/\s+/).filter(w => w.length > 0);
            if (words.length > this.maxLength) {
                const truncated = words.slice(0, this.maxLength).join(' ');
                this.textarea.value = truncated;
                // move cursor to end
                this.textarea.selectionStart = this.textarea.selectionEnd = this.textarea.value.length;
            }
        } else {
            if (this.textarea.value.length > this.maxLength) {
                this.textarea.value = this.textarea.value.substring(0, this.maxLength);
                this.textarea.selectionStart = this.textarea.selectionEnd = this.textarea.value.length;
            }
        }

        this.updateCount();
    }
}

class PanelObj {
    constructor({
        container,
        title,
        data,
        editButton = false,
        editIndex = null,
        deleteButton = false,
        reviewPanel = false,
        labels = null,
        subTable = null
    }) {
        this.container = container; // The DOM element where the panel should be appended
        this.title = title;
        this.data = data;
        this.editButton = editButton;
        this.editIndex = editIndex;
        this.deleteButton = deleteButton;
        this.reviewPanel = reviewPanel;
        this.labels = labels; // Store optional labels
        this.subTable = subTable;

        this.render();
    }

    render() {

        this.panelElement = document.createElement("div");
        this.panelElement.classList.add("panel");

        let editButtonHTML = this.editButton ?
            `<button type="button" class="btn-tertiary edit-btn" data-index="${this.editIndex}"><span class="material-icons">edit</span>Edit</button>` : "";

        let deleteButtonHTML = this.deleteButton ?
            `<button type="button" class="btn-tertiary delete-btn" data-index="${this.editIndex}"><span class="material-icons">delete</span>Delete</button>` : "";
        // Generate table rows for main data
        let tableRows = Object.entries(this.data)
            .map(([key, value], index) => {
                if (value) {
                    let label = this.labels && this.labels[index] ? this.labels[index] : this.formatKey(key);
                    return `<tr><td class="label">${label}</td><td>${value}</td></tr>`;
                }

            })
            .join("");

        let subTableHTML = "";

        // Generate sub-table dynamically if data is provided
        if (this.subTable && this.subTable.rows && this.subTable.rows.length > 0) {
            subTableHTML = `
                <table class="review-table" cellpadding="0" cellspacing="0">
                    <thead>
                        <tr>
                            ${this.subTable.headers.map(header => `<th>${header}</th>`).join("")}
                        </tr>
                    </thead>
                    <tbody>
                        ${this.subTable.rows.map(row => `
                            <tr>
                                ${this.subTable.columns.map(column => `<td>${row[column] || "N/A"}</td>`).join("")}
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            `;
        }

        this.panelElement.innerHTML = `
            <div class="heading-row">
                <h5>${this.title}</h5>
                <div>
                ${editButtonHTML}
                ${deleteButtonHTML}
                </div>
                
            </div>
            <table class="panel-data">
                ${tableRows}
            </table>
            <div>

            ${subTableHTML} <!-- Dynamically insert sub-table if applicable -->
                        </div>

        `;

        this.container.appendChild(this.panelElement);

        const editButton = this.panelElement.querySelector(".edit-btn");

        if (editButton) {
            editButton.addEventListener("click", () => this.emitEditEvent());
        }
        const deleteButton = this.panelElement.querySelector(".delete-btn");

        if (deleteButton) {
            deleteButton.addEventListener("click", () => this.emitDeleteEvent());
        }
    }

    formatKey(key) {
        return key
            .replace(/([A-Z]{2,})/g, match => match) // Keep acronyms like SIN intact
            .replace(/([a-z])([A-Z])/g, "$1 $2") // Insert spaces only between words
            .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
            .trim();
    }

    emitEditEvent() {
        if (this.reviewPanel) {
            document.dispatchEvent(new CustomEvent("navigateToStep", {
                detail: {
                    index: this.editIndex
                }
            }));
        } else {
            document.dispatchEvent(new CustomEvent("editPanelEvent", {
                detail: {
                    index: this.editIndex,
                    panelTitle: this.title,
                    panelData: this.data
                }
            }));
        }
    }
    emitDeleteEvent() {
        document.dispatchEvent(new CustomEvent("deletePanelEvent", {
            detail: {
                index: this.editIndex,
                panelTitle: this.title
            }
        }));
    }
}

class TableObj {
    constructor(tableID, {
        allowEdit = true,
        allowDelete = true
    } = {}) {
        this.table = document.getElementById(tableID);
        this.tbody = this.table.querySelector("tbody");
        this.defaultText = this.tbody.dataset.placeholder;
        this.columnCount = this.table.querySelector("thead tr").children.length;
        this.rows = []; // Store data for easier access


        this.allowEdit = allowEdit;
        this.allowDelete = allowDelete;

        // Initialize the table with placeholder text if empty
        this.renderEmptyTable();
    }
    renderEmptyTable() {
        // If the table has a placeholder data attribute (defaultText), render a proper single-row placeholder
        this.tbody.innerHTML = `<tr class="no-docs-row-placeholder"><td colspan="${this.columnCount}" class="no-docs-cell">${this.defaultText}</td></tr>`;
    }
    addRow(data, rowIndex = this.rows.length) {
        // If the table is displaying the default placeholder row, clear it
        if (this.tbody.querySelector("tr") && this.tbody.querySelector("tr").cells.length === 1) {
            this.tbody.innerHTML = "";
        }
        this.rows[rowIndex] = data; // Ensure correct index assignment

        // Create a new row
        const tr = document.createElement("tr");

        // Populate row with data
        Object.values(data).forEach((value) => {
            const td = document.createElement("td");
            // Allow HTML when the value appears to contain tags (for links/actions)
            if (typeof value === 'string' && value.indexOf('<') !== -1) {
                td.innerHTML = value;
            } else {
                td.textContent = value || "N/A"; // Handle empty fields
            }
            tr.appendChild(td);
        });

        // Actions column (placeholder for buttons)
        const actionTd = document.createElement("td");
        let actionHTML = "";

        if (this.allowEdit) {
            actionHTML += `
                <button type="button" class="btn-tertiary edit-btn" data-index="${rowIndex}">
                    <span class="material-icons">edit</span>Edit
                </button>
            `;
        }

        if (this.allowDelete) {
            actionHTML += `
                <button type="button" class="btn-tertiary delete-btn" data-index="${rowIndex}">
                    <span class="material-icons">close</span>Delete
                </button>
            `;
        }

        if (actionHTML.trim() !== '') {
            actionTd.innerHTML = actionHTML;
            tr.appendChild(actionTd);
        }

        // Append row to table
        this.tbody.appendChild(tr);

        // Attach event listeners
        if (this.allowEdit) {
            actionTd.querySelector(".edit-btn")?.addEventListener("click", (event) => {
                this.emitEditEvent(event.target.closest(".edit-btn").dataset.index);
            });
        }

        if (this.allowDelete) {
            actionTd.querySelector(".delete-btn")?.addEventListener("click", (event) => {
                this.deleteRow(event.target.closest(".delete-btn").dataset.index);
            });
        }

    }

    emitEditEvent(index) {
        index = parseInt(index);
        if (!this.rows[index]) return;

        // Dispatch an event so Step5Handler (or other handlers) can respond
        document.dispatchEvent(new CustomEvent("editRowEvent", {
            detail: {
                tableID: this.table.id,
                index: index,
                rowData: this.rows[index]
            }
        }));
    }
    deleteRow(index) {
        index = parseInt(index);
        this.rows.splice(index, 1);
        this.refreshTable();

        document.dispatchEvent(new CustomEvent("rowDeleted", {
            detail: {
                tableID: this.table.id
            }
        }));
    }
    refreshTable() {
        this.tbody.innerHTML = ""; // Clear the table

        if (this.rows.length === 0) {
            this.renderEmptyTable();
            return;
        }

        this.rows.forEach((rowData, index) => {
            this.addRow(rowData, index);
        });
    }
}

class DatepickerObj {
    constructor(inputId) {
        this.input = document.getElementById(inputId);
        this.wrapper = this.input.parentElement;
        this.icon = this.wrapper.querySelector(".suffix");
        this.modal = this.wrapper.parentElement.querySelector(".datepicker-modal");

        // Open on icon click
        this.icon.addEventListener("click", (e) => {
            e.stopPropagation();
            DatepickerObj.closeAll(); // Close other open ones
            this.open();
        });

        // Open on input click
        this.input.addEventListener("click", (e) => {
            e.stopPropagation();
            DatepickerObj.closeAll();
            this.open();
        });

        // Close if clicking outside
        document.addEventListener("click", (e) => {
            if (!this.wrapper.contains(e.target)) {
                this.close();
            }
        });
    }
    open() {
        const today = new Date();
        this.selectedYear = today.getFullYear();
        this.selectedMonth = today.getMonth();
        this.renderDayView(this.selectedYear, this.selectedMonth);
        this.modal.classList.remove("hidden");
        // Prevent clicks inside the modal from closing it
        this.modal.addEventListener("click", (e) => e.stopPropagation());

        // Mark this step-content as open
        const stepContent = this.wrapper.closest(".step-content");
        if (stepContent) stepContent.classList.add("modal-open");
    }
    close() {
        this.modal.classList.add("hidden");
        const stepContent = this.wrapper.closest(".step-content");
        if (stepContent) stepContent.classList.remove("modal-open");
    }



    static closeAll() {
        document.querySelectorAll(".datepicker-modal").forEach(modal => {
            modal.classList.add("hidden");
        });
    }
    renderDayView(year, month) {
        this.modal.innerHTML = "";

        const container = document.createElement("div");
        container.classList.add("datepicker-grid");

        // Header
        const header = document.createElement("div");
        header.classList.add("datepicker-header");

        // Left: title + dropdown
        const left = document.createElement("div");
        left.classList.add("datepicker-header-left");

        const title = document.createElement("button");
        title.classList.add("datepicker-title-btn");
        title.innerHTML = `${this.getMonthName(month)} ${year} <span class="arrow">▼</span>`;
        title.onclick = () => this.renderYearRange(year - (year % 24));
        left.appendChild(title);

        // Right: arrows
        const right = document.createElement("div");
        right.classList.add("datepicker-header-right");

        const prev = document.createElement("span");
        prev.innerHTML = "&lsaquo;";
        prev.classList.add("datepicker-nav");
        prev.onclick = () => {
            const newMonth = month === 0 ? 11 : month - 1;
            const newYear = month === 0 ? year - 1 : year;
            this.selectedYear = newYear;
            this.selectedMonth = newMonth;
            this.renderDayView(newYear, newMonth);
        };

        const next = document.createElement("span");
        next.innerHTML = "&rsaquo;";
        next.classList.add("datepicker-nav");
        next.onclick = () => {
            const newMonth = month === 11 ? 0 : month + 1;
            const newYear = month === 11 ? year + 1 : year;
            this.selectedYear = newYear;
            this.selectedMonth = newMonth;
            this.renderDayView(newYear, newMonth);
        };

        right.appendChild(prev);
        right.appendChild(next);

        // Final header assembly
        header.appendChild(left);
        header.appendChild(right);
        container.appendChild(header);

        // Weekday headers
        const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const weekdayRow = document.createElement("div");
        weekdayRow.classList.add("day-row");
        weekdays.forEach(d => {
            const day = document.createElement("div");
            day.classList.add("day-name");
            day.textContent = d;
            weekdayRow.appendChild(day);
        });
        container.appendChild(weekdayRow);

        // Day cells
        const grid = document.createElement("div");
        grid.classList.add("day-grid");

        const firstDay = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();

        // Empty slots
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement("div");
            empty.classList.add("day-cell", "empty");
            grid.appendChild(empty);
        }

        for (let i = 1; i <= totalDays; i++) {
            const cell = document.createElement("div");
            cell.classList.add("day-cell");
            cell.textContent = i;
            cell.onclick = () => this.selectDate(year, month, i);
            grid.appendChild(cell);
        }

        container.appendChild(grid);
        this.modal.appendChild(container);
    }

    renderYearRange(startYear = this.getCurrent24Start()) {
        this.modal.innerHTML = ""; // Clear modal

        const container = document.createElement("div");
        container.classList.add("datepicker-grid");

        // Header
        const header = document.createElement("div");
        header.classList.add("datepicker-header");

        const prev = document.createElement("span");
        prev.innerHTML = "&lsaquo;";
        prev.classList.add("datepicker-nav");
        prev.onclick = () => this.renderYearRange(startYearAdjusted - 24);

        const title = document.createElement("div");
        title.classList.add("datepicker-title");
        title.textContent = `${startYear} - ${startYear + 23}`;

        const next = document.createElement("span");
        next.innerHTML = "&rsaquo;";
        next.classList.add("datepicker-nav");

        //next.onclick = () => this.renderYearRange(startYear + 24);
        next.style.visibility = "hidden";
        header.appendChild(prev);
        header.appendChild(title);
        header.appendChild(next);
        container.appendChild(header);

        // Year grid
        const grid = document.createElement("div");
        grid.classList.add("year-grid");

        const currentYear = new Date().getFullYear();
        const endYear = currentYear;
        const startYearAdjusted = endYear - 23;

        for (let i = 0; i < 24; i++) {
            const year = startYearAdjusted + i;
            const cell = document.createElement("div");
            cell.classList.add("datepicker-cell");
            cell.textContent = year;
            cell.onclick = () => this.renderMonthView(year);
            grid.appendChild(cell);
        }

        container.appendChild(grid);
        this.modal.appendChild(container);
    }

    renderMonthView(year) {
        this.modal.innerHTML = ""; // Clear modal

        const container = document.createElement("div");
        container.classList.add("datepicker-grid");

        // Header with back arrow and year label
        const header = document.createElement("div");
        header.classList.add("datepicker-header");

        const back = document.createElement("span");
        back.innerHTML = "&lsaquo;";
        back.classList.add("datepicker-nav");
        back.onclick = () => this.renderYearRange(this.getCurrent24Start(year));

        const title = document.createElement("div");
        title.classList.add("datepicker-title");
        title.textContent = year;

        header.appendChild(back);
        header.appendChild(title);
        container.appendChild(header);

        // Month grid
        const grid = document.createElement("div");
        grid.classList.add("month-grid");

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ];

        monthNames.forEach((name, index) => {
            const cell = document.createElement("div");
            cell.classList.add("datepicker-cell");
            cell.textContent = name;
            cell.onclick = () => {
                this.selectedMonth = index;
                this.renderDayView(year, index);
            };
            grid.appendChild(cell);
        });

        container.appendChild(grid);
        this.modal.appendChild(container);
    }

    getCurrent24Start(current = new Date().getFullYear()) {
        return current - 23;
    }
    handleYearClick(year) {
        this.selectedYear = year;
        this.renderMonthView(year); // Call month view after picking a year
    }
    selectDate(year, month, day) {
        const formatted = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        this.input.value = formatted;
        this.input.dispatchEvent(new CustomEvent('dateSelected', {
            detail: {
                value: this.input.value
            }
        }));
        this.modal.classList.add("hidden");
    }

    getMonthName(index) {
        return ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ][index];
    }



}

class DataManager {
    static saveData(key, value) {
        sessionStorage.setItem(key, JSON.stringify(value));
        document.dispatchEvent(new CustomEvent("dataUpdated", {
            detail: {
                key,
                data: value
            }
        }));
    }
    static appendToArray(key, newValue) {
        let existingData = DataManager.getData(key) || [];
        if (!Array.isArray(existingData)) existingData = []; // Ensure it's an array
        existingData.push(newValue);
        DataManager.saveData(key, existingData);
    }

    static getData(key) {
        let data = sessionStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    }

    static clearData(key) {
        sessionStorage.removeItem(key);
    }
}

class FormLightbox {
    constructor(lightbox) {
        this.lightbox = lightbox;
        this.form = this.lightbox.querySelector('form');
        this.openTrigger = document.querySelector(`[data-togglelb="${lightbox.id}"]`);
        this.submitButton = this.lightbox.querySelector('[data-submit]');
        this.editIndex = null;

        if (this.openTrigger) {
            this.openTrigger.addEventListener('click', () => {
                this.openLightbox();
                this.clearFormData();
            });
            if (this.openTrigger.value) {
                var buttonText = document.createTextNode(this.openTrigger.value);
                this.openTrigger.appendChild(buttonText)
            }
        }
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.lightbox.querySelectorAll('[data-closebtn]').forEach(btn => {
            btn.addEventListener('click', () => this.closeLightbox());
        });

        if (this.submitButton) {
            this.submitButton.addEventListener('click', (event) => {
                event.preventDefault();
                this.sendFormData();

            });
        }
    }
    openLightbox() {
        this.lightbox.classList.add('open');
    }

    closeLightbox() {
        this.lightbox.classList.remove('open');
        this.clearEditIndex();
    }

    clearFormData() {
        if (!this.form) return;
        this.form.querySelectorAll("input, select, textarea").forEach(input => {
            if (input.type === "checkbox" || input.type === "radio") {
                input.checked = false;
            } else {
                input.value = "";
                
            }
        });
        let hiddenEls = this.form.querySelectorAll("[data-inithidden]");
        if (hiddenEls.length > 0) {
            hiddenEls.forEach(el => {
                el.classList.add("hidden");
            })
        }
        // Reset spans with data-formelement
        this.form.querySelectorAll("[data-formelement]").forEach(span => {
            span.textContent = span.dataset.placeholder || "";
        });
    }

    populateForm(data) {
        if (!this.form) return;
        Object.keys(data).forEach((key) => {
            const input = this.form.querySelector(`[name="${key}"]`);
            if (input) input.value = data[key];
        });
    }

    sendFormData() {
        const formData = new FormData(this.form);
        let dataObj = {};

        formData.forEach((value, key) => {
            dataObj[key] = value;
        });

        document.dispatchEvent(new CustomEvent("lightboxSubmitted", {
            detail: {
                lightboxId: this.lightbox.id,
                formData: dataObj
            }
        }));

        this.closeLightbox();
    }

    setEditIndex(index) {
        this.editIndex = index;
    }

    getEditIndex() {
        return this.editIndex;
    }
    clearEditIndex() {
        this.editIndex = null;
    }
}

class ProgressiveDisclosure {
    constructor(stepperInstance = null) {
        this.stepper = stepperInstance;
        this.initializeEventListeners();
        this.outConditions = [
            ["resOfPerson-nonresident"],
            ["resOfPerson-tbd"],
            ["resOfPerson-idk"],
            ["previousCanadianResident-no"],
            ["employment-forempl"],
            ["employment-spouseforempl"],
            ["employment-depforempl"]
            //step 1 selections that result in an "out"
            // ["s0q1-op2"],
            // ["s1q2-op1"],
            // ["s1q2-op3"],
            // ["s1q3-op2"]
        ];

    }

    initializeEventListeners() {
        // Attach change event to all elements with the `data-toggle` attribute
        document.querySelectorAll('[data-toggle], input[type="radio"], input[type="checkbox"]').forEach(input => {

            input.addEventListener('change', this.handleInputChange.bind(this));


        });

    }

    handleInputChange(event) {
        this.handleToggle(event); // Ensure Progressive Disclosure still works
        this.outCheck(); // Check if the user should be redirected
    }

    handleToggle(event) {
        const input = event.target;
        const toggleTargets = input.getAttribute('data-toggle');



        // Hide all sibling toggle targets in the same group
        this.hideOtherTargets(input);

        // If the current input has a data-toggle, handle its targets
        if (toggleTargets) {
            const targetIds = toggleTargets.split(',').map(id => id.trim());
            targetIds.forEach(targetId => {
                const targetElement = document.getElementById(targetId);
                if (!targetElement) {
                    console.error(`Element with ID '${targetId}' not found.`);
                    return;
                }

                if (input.type === "select-one") {
                    const options = input.childNodes;

                    options.forEach(option => {
                        if (option.selected && option.value != null) {
                            targetElement.classList.remove('hidden');
                        }
                    });
                } else if (input.type === "date") {
                    targetElement.classList.remove("hidden");
                } else if (input.type === "checkbox") {
                    if (input.checked) {
                        targetElement.classList.remove('hidden');
                    } else if (!this.isAnyCheckboxInGroupCheckedForTarget(input, targetId)) {
                        this.hideWithSubfields(targetElement);
                    }
                } else if (input.checked) {
                    targetElement.classList.remove('hidden');
                }
            });
        }

        // Adjust stepper height if available
        if (this.stepper) {
            const currStep = this.stepper.activeStep;
            this.stepper.adjustMaxHeight(currStep);
        }
    }


    hideOtherTargets(input) {
        if (input.type === 'checkbox') {
            return;
        }

        const groupName = input.name;

        if (groupName) {
            const groupInputs = document.querySelectorAll(`input[name="${groupName}"]`);

            groupInputs.forEach(groupInput => {
                const otherTargets = groupInput.getAttribute('data-toggle');

                if (otherTargets) {
                    const targetIds = otherTargets.split(',').map(id => id.trim());

                    targetIds.forEach(targetId => {
                        const targetElement = document.getElementById(targetId);
                        if (targetElement) {
                            this.hideWithSubfields(targetElement);
                        }
                    });
                }
            });

            // Hide all subsequent fieldsets if the current input triggers an out
            const parentFieldset = input.closest("fieldset");
            if (parentFieldset && parentFieldset.classList.contains("hidden")) {
                let nextFieldset = parentFieldset.nextElementSibling;
                while (nextFieldset) {
                    if (nextFieldset.tagName === "FIELDSET") {
                        this.hideWithSubfields(nextFieldset);
                    }
                    nextFieldset = nextFieldset.nextElementSibling;
                }
            }
        }
    }

    isAnyCheckboxInGroupCheckedForTarget(input, targetId) {
        const groupName = input.name;
        if (!groupName) {
            return false;
        }

        const groupCheckboxes = document.querySelectorAll(`input[name="${groupName}"][type="checkbox"]`);
        return Array.from(groupCheckboxes).some(box => {
            if (!box.checked) {
                return false;
            }
            const boxTargets = box.getAttribute('data-toggle');
            if (!boxTargets) {
                return false;
            }
            return boxTargets.split(',').map(id => id.trim()).includes(targetId);
        });
    }


    hideWithSubfields(element) {
        element.classList.add("hidden");
         

        // Clear all inputs inside the hidden element
        const inputs = element.querySelectorAll('input, select, select-one, textarea, option');
        inputs.forEach(input => {
            if (input.type === 'radio' || input.type === 'checkbox') {
                input.checked = false;
            } else if (input.type === 'text') {
                input.value = '';
               
            }
            else if (input.type === 'select-one') {
                input.selectedIndex = 0;
            }
            
        });

        // Recursively hide any nested fields inside this element
        const nestedToggles = element.querySelectorAll('[data-toggle]');
        nestedToggles.forEach(nestedToggle => {
            const nestedTargets = nestedToggle.getAttribute('data-toggle');
            if (nestedTargets) {
                nestedTargets.split(',').forEach(nestedTargetId => {
                    const nestedTargetElement = document.getElementById(nestedTargetId.trim());
                    if (nestedTargetElement) {
                        this.hideWithSubfields(nestedTargetElement);
                    }
                });
            }
        });
    }

    outCheck() {
        let selectedInputs = Array.from(document.querySelectorAll('input:checked')).map(input => input.id);

        let isOut = this.outConditions.some(conditionSet => conditionSet.every(id => selectedInputs.includes(id)));

        this.updateNavigationButtons(isOut);

    }

    updateNavigationButtons(isOut) {
        const activeStep = document.querySelector('.step.active'); // Get the current active step
        if (!activeStep) return;

        const nextBtn = activeStep.querySelector('.next-button');
        const backBtn = activeStep.querySelector('.back-button');
        const outBtn = activeStep.querySelector('.out-button');

        if (!outBtn) return; // If no next button is found, exit

        if (isOut) {
            nextBtn.classList.add("hidden");
            if (backBtn)
                backBtn.classList.add("hidden");

            outBtn.classList.remove("hidden");

        } else {
            nextBtn.classList.remove("hidden");
            if (backBtn)
                backBtn.classList.remove("hidden");

            outBtn.classList.add("hidden");
        }
    }

}

// Science categories and fields data (labels with codes placed in brackets at the end)
const SCIENCE_DATA = {
    "Natural and formal sciences": {
        "Mathematics": [
            { code: "1.01.01", label: "Pure mathematics" },
            { code: "1.01.02", label: "Applied mathematics" },
            { code: "1.01.03", label: "Statistics and probability" }
        ],
        "Computer and information sciences": [
            { code: "1.02.01", label: "Computer sciences" },
            { code: "1.02.02", label: "Information technology and bioinformatics" }
        ],
        "Physical sciences": [
            { code: "1.03.01", label: "Atomic, molecular, and chemical physics" },
            { code: "1.03.02", label: "Interaction with radiation" },
            { code: "1.03.03", label: "Magnetic resonances" },
            { code: "1.03.04", label: "Condensed matter physics" },
            { code: "1.03.05", label: "Solid state physics and superconductivity" },
            { code: "1.03.06", label: "Particles and fields physics" },
            { code: "1.03.07", label: "Nuclear physics" },
            { code: "1.03.08", label: "Fluids and plasma physics (including surface physics)" },
            { code: "1.03.09", label: "Optics (including laser optics and quantum optics)" },
            { code: "1.03.10", label: "Acoustics" },
            { code: "1.03.11", label: "Astronomy (including astrophysics space science)" }
        ],
        "Chemical sciences": [
            { code: "1.04.01", label: "Organic chemistry" },
            { code: "1.04.02", label: "Inorganic and nuclear chemistry" },
            { code: "1.04.03", label: "Physical chemistry, polymer science, and plastics" },
            { code: "1.04.04", label: "Electrochemistry (dry cells, batteries, fuel cells, metal corrosion, electrolysis)" },
            { code: "1.04.05", label: "Colloid chemistry" },
            { code: "1.04.06", label: "Analytical chemistry" }
        ],
        "Earth and related Environmental sciences": [
            { code: "1.05.01", label: "Geosciences, multidisciplinary" },
            { code: "1.05.02", label: "Mineralogy and palaeontology" },
            { code: "1.05.03", label: "Geochemistry and geophysics" },
            { code: "1.05.04", label: "Physical geography" },
            { code: "1.05.05", label: "Geology and volcanology" },
            { code: "1.05.06", label: "Environmental sciences" },
            { code: "1.05.07", label: "Meteorology, atmospheric sciences, and climatic research" },
            { code: "1.05.08", label: "Oceanography, hydrology, and water resources" }
        ],
        "Biological sciences": [
            { code: "1.06.01", label: "Cell biology, microbiology, and virology" },
            { code: "1.06.02", label: "Biochemistry, molecular biology, and Biochemical research" },
            { code: "1.06.03", label: "Mycology" },
            { code: "1.06.04", label: "Biophysics" },
            { code: "1.06.05", label: "Genetics and heredity" },
            { code: "1.06.06", label: "Reproductive biology" },
            { code: "1.06.07", label: "Developmental biology" },
            { code: "1.06.08", label: "Plant sciences and botany" },
            { code: "1.06.09", label: "Zoology, ornithology, entomology, and behavioural sciences biology" },
            { code: "1.06.10", label: "Marine biology, freshwater biology, and limnology" },
            { code: "1.06.11", label: "Ecology and biodiversity conservation" },
            { code: "1.06.12", label: "Biology (theoretical, thermal, cryobiology, biological rhythm)" },
            { code: "1.06.13", label: "Evolutionary biology" }
        ],
        "Other natural sciences": [
            { code: "1.07.01", label: "Other natural sciences" }
        ]
    },
    "Engineering and technology": {
        "Civil engineering": [
            { code: "2.01.01", label: "Civil engineering" },
            { code: "2.01.02", label: "Architecture engineering" },
            { code: "2.01.03", label: "Municipal and structural engineering" },
            { code: "2.01.04", label: "Transport engineering" }
        ],
        "Electrical engineering, Electronic engineering, and Information technology": [
            { code: "2.02.01", label: "Electrical and electronic engineering" },
            { code: "2.02.02", label: "Robotics and automatic control" },
            { code: "2.02.03", label: "Micro-electronics" },
            { code: "2.02.04", label: "Semiconductors" },
            { code: "2.02.05", label: "Automation and control systems" },
            { code: "2.02.06", label: "Communication engineering and systems" },
            { code: "2.02.07", label: "Telecommunications" },
            { code: "2.02.08", label: "Computer hardware and architecture" },
            { code: "2.02.09", label: "Software engineering and technology" }
        ],
        "Mechanical engineering": [
            { code: "2.03.01", label: "Mechanical engineering" },
            { code: "2.03.02", label: "Applied mechanics" },
            { code: "2.03.03", label: "Thermodynamics" },
            { code: "2.03.04", label: "Aerospace engineering" },
            { code: "2.03.05", label: "Nuclear related engineering" },
            { code: "2.03.06", label: "Acoustical engineering" },
            { code: "2.03.07", label: "Reliability analysis and non-destructive testing" },
            { code: "2.03.08", label: "Automotive and transportation engineering and manufacturing" },
            { code: "2.03.09", label: "Tooling, machinery, and equipment engineering and manufacturing" },
            { code: "2.03.10", label: "Heating, ventilation, and Air conditioning engineering and manufacturing" }
        ],
        "Chemical engineering": [
            { code: "2.04.01", label: "Chemical engineering (plants, products)" },
            { code: "2.04.02", label: "Chemical process engineering" }
        ],
        "Materials engineering": [
            { code: "2.05.01", label: "Materials engineering and metallurgy" },
            { code: "2.05.02", label: "Ceramics" },
            { code: "2.05.03", label: "Coating and films (including packaging and printing)" },
            { code: "2.05.04", label: "Plastics, Rubber, and Composites (including laminates and reinforced plastics)" },
            { code: "2.05.05", label: "Paper and wood and textiles" },
            { code: "2.05.06", label: "Construction materials (organic and inorganic)" }
        ],
        "Medical engineering": [
            { code: "2.06.01", label: "Medical and biomedical engineering" },
            { code: "2.06.02", label: "Medical laboratory technology" }
        ],
        "Environmental engineering": [
            { code: "2.07.01", label: "Environmental and geological engineering" },
            { code: "2.07.02", label: "Petroleum engineering (fuel, oils)" },
            { code: "2.07.03", label: "Energy and fuels" },
            { code: "2.07.04", label: "Remote sensing" },
            { code: "2.07.05", label: "Mining and mineral processing" },
            { code: "2.07.06", label: "Marine engineering, sea vessels, and ocean engineering" }
        ],
        "Environmental biotechnology": [
            { code: "2.08.01", label: "Environmental biotechnology" },
            { code: "2.08.02", label: "Bioremediation" },
            { code: "2.08.03", label: "Diagnostic biotechnologies in environmental management" }
        ],
        "Industrial biotechnology": [
            { code: "2.09.01", label: "Industrial biotechnology" },
            { code: "2.09.02", label: "Bioprocessing technologies" },
            { code: "2.09.03", label: "Biocatalysis and fermentation" },
            { code: "2.09.04", label: "Bioproducts" },
            { code: "2.09.05", label: "Biomaterials" }
        ],
        "Nano-technology": [
            { code: "2.10.01", label: "Nano-materials (production and properties)" },
            { code: "2.10.02", label: "Nano-processes (applications on nano-scale)" }
        ],
        "Other engineering and technologies": [
            { code: "2.11.01", label: "Food and beverages" },
            { code: "2.11.02", label: "Oenology" },
            { code: "2.11.03", label: "Other engineering and technologies" }
        ]
    },
    "Medical and Health sciences": {
        "Basic medicine": [
            { code: "3.01.01", label: "Anatomy and morphology" },
            { code: "3.01.02", label: "Human genetics" },
            { code: "3.01.03", label: "Immunology" },
            { code: "3.01.04", label: "Neurosciences" },
            { code: "3.01.05", label: "Pharmacology and pharmacy and medicinal chemistry" },
            { code: "3.01.06", label: "Toxicology" },
            { code: "3.01.07", label: "Physiology and cytology" },
            { code: "3.01.08", label: "Pathology" }
        ],
        "Clinical medicine": [
            { code: "3.02.01", label: "Andrology" },
            { code: "3.02.02", label: "Obstetrics and gynaecology" },
            { code: "3.02.03", label: "Paediatrics" },
            { code: "3.02.04", label: "Cardiac and cardiovascular systems" },
            { code: "3.02.05", label: "Haematology" },
            { code: "3.02.06", label: "Anaesthesiology" },
            { code: "3.02.07", label: "Orthopaedics" },
            { code: "3.02.08", label: "Radiology and nuclear medicine" },
            { code: "3.02.09", label: "Dentistry, oral surgery, and medicine" },
            { code: "3.02.10", label: "Dermatology, venereal diseases, and allergy" },
            { code: "3.02.11", label: "Rheumatology" },
            { code: "3.02.12", label: "Endocrinology and metabolism and gastroenterology" },
            { code: "3.02.13", label: "Urology and nephrology" },
            { code: "3.02.14", label: "Oncology" }
        ],
        "Health sciences": [
            { code: "3.03.01", label: "Health care sciences and nursing" },
            { code: "3.03.02", label: "Nutrition and dietetics" },
            { code: "3.03.03", label: "Parasitology" },
            { code: "3.03.04", label: "Infectious diseases and epidemiology" },
            { code: "3.03.05", label: "Occupational health" }
        ],
        "Medical biotechnology": [
            { code: "3.04.01", label: "Health-related biotechnology" },
            { code: "3.04.02", label: "Technologies involving the manipulation of cells, tissues, organs, or the whole organism" },
            { code: "3.04.03", label: "Technologies involving identifying the functioning of DNA, proteins, and enzymes" },
            { code: "3.04.04", label: "Pharmacogenomics, gene-based therapeutics" },
            { code: "3.04.05", label: "Biomaterials" }
        ],
        "Other medical sciences": [
            { code: "3.05.01", label: "Forensic science" },
            { code: "3.05.02", label: "Other medical sciences" }
        ]
    },
    "Agricultural sciences": {
        "Agriculture, Forestry, and Fisheries Veterinary science": [
            { code: "4.01.01", label: "Agriculture" },
            { code: "4.01.02", label: "Forestry" },
            { code: "4.01.03", label: "Fisheries and Aquaculture" },
            { code: "4.01.04", label: "Soil science" },
            { code: "4.01.05", label: "Horticulture" },
            { code: "4.01.06", label: "Viticulture" },
            { code: "4.01.07", label: "Agronomy" },
            { code: "4.01.08", label: "Plant breeding and plant protection" }
        ],
        "Animal and dairy science": [
            { code: "4.02.01", label: "Animal and Dairy science" },
            { code: "4.02.02", label: "Animal husbandry" }
        ],
        "Veterinary science": [
            { code: "4.03.01", label: "Veterinary science (all)" }
        ],
        "Agricultural biotechnology": [
            { code: "4.04.01", label: "Agricultural biotechnology and food biotechnology" },
            { code: "4.04.02", label: "Genetically Modified (GM) organism technology and livestock cloning" },
            { code: "4.04.03", label: "Diagnostics (DNA chips and biosensing devices)" },
            { code: "4.04.04", label: "Biomass feedstock production technologies" },
            { code: "4.04.05", label: "Biopharming" }
        ],
        "Other agricultural sciences": [
            { code: "4.05.01", label: "Other agricultural sciences" }
        ]
    }
};

function populateCategoryDropdowns() {
    const categories = Object.keys(SCIENCE_DATA);
    const fieldOfR = document.getElementById('fieldofR-field');
    const catSel = document.getElementById('catofSci-field');
    if (fieldOfR) {
        fieldOfR.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.selected = true;
        defaultOpt.textContent = '(Select)';
        fieldOfR.appendChild(defaultOpt);
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            fieldOfR.appendChild(opt);
        });
    }
    // Reset category select until a Field of Research is chosen
    if (catSel) {
        catSel.innerHTML = '';
        const defaultOpt2 = document.createElement('option');
        defaultOpt2.value = '';
        defaultOpt2.selected = true;
        defaultOpt2.textContent = '(Select)';
        catSel.appendChild(defaultOpt2);
    }
}

function populateCatForFieldOfResearch(parent) {
    const catSel = document.getElementById('catofSci-field');
    const fieldSel = document.getElementById('fieldofSci-field');
    if (!catSel) return;
    catSel.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.selected = true;
    defaultOpt.textContent = '(Select)';
    catSel.appendChild(defaultOpt);
    if (!parent || !SCIENCE_DATA[parent]) return;
    Object.keys(SCIENCE_DATA[parent]).forEach(subcat => {
        const opt = document.createElement('option');
        opt.value = subcat;
        opt.textContent = subcat;
        opt.dataset.parent = parent;
        catSel.appendChild(opt);
    });
    // clear fieldofSci
    if (fieldSel) {
        fieldSel.innerHTML = '';
        const d = document.createElement('option');
        d.value = '';
        d.selected = true;
        d.textContent = '(Select)';
        fieldSel.appendChild(d);
    }
}

function populateFieldsForCategory(parent, subcat) {
    const fieldSel = document.getElementById('fieldofSci-field');
    if (!fieldSel) return;
    fieldSel.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.selected = true;
    defaultOpt.textContent = '(Select)';
    fieldSel.appendChild(defaultOpt);
    if (!parent || !subcat || !SCIENCE_DATA[parent] || !SCIENCE_DATA[parent][subcat]) return;
    SCIENCE_DATA[parent][subcat].forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.code;
        opt.textContent = `${item.label} (${item.code})`;
        opt.dataset.parent = parent;
        opt.dataset.subcat = subcat;
        opt.dataset.code = item.code;
        fieldSel.appendChild(opt);
    });
}

function validateStepBeforeSave(step) {
    if (!step) return true;

    const requiredFields = Array.from(step.querySelectorAll('[required]'))
        .filter(field => field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)
        .filter(field => field.offsetParent !== null);
    const invalidField = requiredFields.find(field => !field.checkValidity());
    if (!invalidField) return true;

    invalidField.reportValidity();
    return false;
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const navFrom = params.get('from');

    const needsTask = document.querySelector('.stepper') || document.querySelector('.confirmation-wrapper');
    let taskData = sessionStorage.getItem("selectedTask");

    if (needsTask) {
        // if sessionStorage is missing but localStorage has the selected task, copy it over
        if (!taskData && localStorage.getItem('selectedTask')) {
            sessionStorage.setItem('selectedTask', localStorage.getItem('selectedTask'));
            if (localStorage.getItem('taskNum')) sessionStorage.setItem('taskNum', localStorage.getItem('taskNum'));
            taskData = sessionStorage.getItem('selectedTask');
        }
        if (!taskData) {
                // If this navigation originated from the PCA overview or we have an allow flag, allow localStorage fallback
                const allowVal = localStorage.getItem('allowStepper');
                let allowRecent = false;
                if (allowVal) {
                    const ts = parseInt(allowVal, 10);
                    if (!isNaN(ts) && (Date.now() - ts) < 5000) allowRecent = true;
                }
                if ((navFrom === 'pca' && localStorage.getItem('selectedTask')) || allowRecent) {
                    if (localStorage.getItem('selectedTask')) {
                        sessionStorage.setItem('selectedTask', localStorage.getItem('selectedTask'));
                        if (localStorage.getItem('taskNum')) sessionStorage.setItem('taskNum', localStorage.getItem('taskNum'));
                        taskData = sessionStorage.getItem('selectedTask');
                    }
                    // clear the allow flag after use
                    try { localStorage.removeItem('allowStepper'); } catch (e) {}
                }
            if (!taskData) {
                // If user lands on a page that requires a task without selecting one, redirect back
                window.location.href = "chooser.html";
                return;
            }
        }
        taskData = JSON.parse(taskData);
        console.log("Loaded Task Data:", taskData);
        DataManager.saveData("accountInfo", taskData.accountInfo);

        if (taskData.accountInfo) {
            const nameEl = document.getElementById("task-account-name");
            const bn9El = document.getElementById("task-account-bn9");
            if (nameEl) nameEl.textContent = taskData.accountInfo.businessName || '';
            if (bn9El) bn9El.textContent = taskData.bn9 || '';
        }
    } else {
        // For pages that don't strictly require a selected task, optionally set account info if available
        if (taskData) {
            try {
                taskData = JSON.parse(taskData);
                const nameEl = document.getElementById("task-account-name");
                const bn9El = document.getElementById("task-account-bn9");
                if (taskData.accountInfo) {
                    if (nameEl) nameEl.textContent = taskData.accountInfo.businessName || '';
                    if (bn9El) bn9El.textContent = taskData.bn9 || '';
                }
            } catch (e) {
                console.warn('Invalid selectedTask JSON');
            }
        }
    }
    // Initialize stepper and related UI only if this page contains the stepper
    const stepperContainer = document.querySelector('.stepper');
    if (stepperContainer) {
        // Initialize Stepper
        const stepper = new Stepper('.step');

        // Initialize ProgressiveDisclosure and pass the stepper instance
        new ProgressiveDisclosure(stepper);

        // Load the last step from session storage
        const savedStepId = sessionStorage.getItem('currentStep');
        if (savedStepId) {
            stepper.jumpStep(savedStepId);
        }

        // Handle step navigation and Save and exit from one delegated listener.
        stepperContainer.addEventListener('click', (event) => {
            const nextButton = event.target.closest('.next-button');
            const backButton = event.target.closest('.back-button');
            const saveExitButton = event.target.closest('.save-exit-button');
            const currentIndex = stepper.steps.indexOf(stepper.activeStep);

            if (saveExitButton) {
                if (!validateStepBeforeSave(stepper.activeStep)) return;
                stepper.storeData(currentIndex);
                const pcaId = sessionStorage.getItem('currentPCA') || localStorage.getItem('currentPCA');
                const saved = saveCurrentProjectToPCA(false);
                if (!saved) {
                    alert('Could not save the project. Ensure you started this flow by clicking "Add a new project" from a PCA projects page.');
                    return;
                }
                sessionStorage.setItem('navigatingToPcaProjects', 'true');
                const query = pcaId ? `?pcaId=${encodeURIComponent(pcaId)}` : '';
                window.location.href = `pca-projects.html${query}`;
            } else if (nextButton) {
                // If currently on the last step, finalize project and navigate to confirmation
                const lastIndex = stepper.steps.length - 1;
                if (currentIndex === lastIndex) {
                    // Ensure last step data is stored
                    stepper.storeData(currentIndex);
                    // Attempt to save project to PCA if applicable
                    const saved = saveCurrentProjectToPCA(true);
                    if (!saved) {
                        alert('Could not save the project. Ensure you started this flow by clicking "Add a new project" from a PCA projects page.');
                        return; // Do not navigate away if save failed
                    }
                    // Prevent session data from being cleared on unload while navigating
                    sessionStorage.setItem('navigatingToConfirmation', 'true');
                    // Redirect to confirmation page
                    window.location.href = 'confirmation.html';
                } else {
                    stepper.navigateStep('next');
                }

            } else if (backButton) {
                stepper.navigateStep('back');

            }
        });

        // Populate radio button labels with their 'value', but skip labels explicitly marked to preserve their content
        const inputsWithLabels = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        inputsWithLabels.forEach(input => {
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label) {
                // If the label includes data-preserve, do not overwrite its innerHTML
                if (label.dataset && label.dataset.preserve === 'true') return;
                label.textContent = input.value;
            }
        });

        // Initialize CharacterCounters
        document.querySelectorAll("textarea[data-maxlength]").forEach(textarea => {
            const mode = textarea.dataset.count === 'words' ? 'words' : 'chars';
            new CharacterCounter(textarea, mode);
        });

        // Initialize dynamic category and field dropdowns
        populateCategoryDropdowns();
        const catSelect = document.getElementById('catofSci-field');
        const fieldOfRSelect = document.getElementById('fieldofR-field');
        const fieldOfSciSelect = document.getElementById('fieldofSci-field');

        if (fieldOfRSelect) {
            fieldOfRSelect.addEventListener('change', (e) => {
                const selectedParent = e.target.value;
                populateCatForFieldOfResearch(selectedParent);
            });
        }

        if (catSelect) {
            catSelect.addEventListener('change', (e) => {
                const selectedSubcat = e.target.value;
                const parent = e.target.selectedOptions[0]?.dataset?.parent || '';
                // ensure parent select matches
                if (fieldOfRSelect && parent) fieldOfRSelect.value = parent;
                populateFieldsForCategory(parent, selectedSubcat);
            });
            // If there is a pre-selected category, populate fields accordingly
            if (catSelect.value) {
                const preParent = catSelect.selectedOptions[0]?.dataset?.parent || '';
                populateFieldsForCategory(preParent, catSelect.value);
            }
        }

        if (fieldOfSciSelect) {
            fieldOfSciSelect.addEventListener('change', (e) => {
                const selectedOpt = e.target.selectedOptions[0];
                if (!selectedOpt) return;
                const parent = selectedOpt.dataset.parent;
                const subcat = selectedOpt.dataset.subcat;
                if (fieldOfRSelect && parent) fieldOfRSelect.value = parent;
                if (catSelect && subcat) catSelect.value = subcat;
            });
        }

        const editProjectId = params.get('editProjectId') || sessionStorage.getItem('editingProjectId');
        if (editProjectId) {
            const editPcaId = sessionStorage.getItem('currentPCA') || localStorage.getItem('currentPCA');
            const editPca = findPCAById(editPcaId);
            const editProject = editPca?.projects?.find(project => project.id === editProjectId);
            const saved = editProject?.data || {};
            if (editProject) {
                const fieldOfResearch = saved.fieldOfResearch || '';
                const categoryOfScience = saved.categoryOfScience || '';
                const fieldOfScience = saved.fieldOfScience || '';
                if (fieldOfRSelect) fieldOfRSelect.value = fieldOfResearch;
                populateCatForFieldOfResearch(fieldOfResearch);
                if (catSelect) catSelect.value = categoryOfScience;
                populateFieldsForCategory(fieldOfResearch, categoryOfScience);
                const fieldOption = Array.from(fieldOfSciSelect?.options || [])
                    .find(option => option.textContent === fieldOfScience || option.textContent.includes(fieldOfScience));

                DataManager.saveData('stepData_1', {
                    projecttitle: editProject.name || '',
                    startDate: saved.startDate || '',
                    projectLength: saved.projectLength || '',
                    'fieldofR-field': fieldOfResearch,
                    'catofSci-field': categoryOfScience,
                    'fieldofSci-field': fieldOption?.value || fieldOfScience,
                    expenditure: saved.expenditure || ''
                });
                DataManager.saveData('stepData_2', { uncertainty: saved.uncertainty || '' });
                DataManager.saveData('stepData_3', { duedilligence: saved.duedilligence || '' });
                DataManager.saveData('stepData_4', {
                    hypothesis: saved.hypothesis || '',
                    solutions: saved.solutions || '',
                    experiments: saved.experiments || '',
                    factors: saved.factors || '',
                    success: saved.success || ''
                });
                DataManager.saveData('stepData_5', { documents: saved.documents || [] });
                stepper.loadStoredData();
                stepper.setActive(stepper.steps[1]);
            }
        }


        //Accordion functionality
        const accordions = document.querySelectorAll('.accordion');
        accordions.forEach(accordion => {
            accordion.addEventListener('click', function() {
                this.classList.toggle('active');

            });
        });
    }

});

window.addEventListener('beforeunload', (event) => {
    const navigatingToConfirmation = sessionStorage.getItem("navigatingToConfirmation");
    const navigatingToStepper = sessionStorage.getItem("navigatingToStepper");
    const navigatingToPcaProjects = sessionStorage.getItem("navigatingToPcaProjects");

    if (!navigatingToConfirmation && !navigatingToStepper && !navigatingToPcaProjects) {
   
        // Clear transient session data
        sessionStorage.clear();
    }
    sessionStorage.removeItem("navigatingToConfirmation"); // Reset flag after navigation
    sessionStorage.removeItem("navigatingToPcaProjects");
});

/* PCA overview & projects pages logic */
function _generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function _formatDateNice(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const opts = { year: 'numeric', month: 'long', day: 'numeric' };
    return d.toLocaleDateString('en-US', opts);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _pcaStorageKey() {
    const taskNum = sessionStorage.getItem('taskNum') || localStorage.getItem('taskNum') || 'default';
    return `pca_list_task_${taskNum}`;
}

function getPCAs() {
    try {
        const stored = localStorage.getItem(_pcaStorageKey());
        if (stored) return JSON.parse(stored);

        const task = JSON.parse(sessionStorage.getItem('selectedTask') || localStorage.getItem('selectedTask') || '{}');
        return Array.isArray(task.pcaList) ? task.pcaList : [];
    } catch (e) {
        return [];
    }
}

function savePCAs(list) {
    localStorage.setItem(_pcaStorageKey(), JSON.stringify(list));
}

// find a PCA by id across all task lists as a fallback
function findPCAById(pcaId) {
    if (!pcaId) return null;
    // try current task first
    let list = getPCAs();
    let pca = list.find(p => p.id === pcaId);
    if (pca) return pca;

    // search all keys in localStorage that match pca_list_task_
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('pca_list_task_')) continue;
        try {
            const arr = JSON.parse(localStorage.getItem(key) || '[]');
            const found = arr.find(p => p.id === pcaId);
            if (found) return found;
        } catch (e) {
            // ignore parse errors
        }
    }
    return null;
}

function initPCAOverview() {
    const startBtn = document.getElementById('start-new-pca');
    const editLightbox = document.getElementById('edit-pca-lightbox');
    const editForm = document.getElementById('edit-pca-form');
    const tableObj = new TableObj('pca-overview-tb', { allowEdit: false, allowDelete: false });
    const tableBody = tableObj.tbody;
    let editingPcaId = null;

    function render() {
        // Ensure session has taskNum (fallback from localStorage) so getPCAs reads the correct key
        if (!sessionStorage.getItem('taskNum') && localStorage.getItem('taskNum')) {
            try { sessionStorage.setItem('taskNum', localStorage.getItem('taskNum')); } catch (e) {}
        }
        let list = getPCAs();
        // If no PCAs found in the session-scoped key, try loading from localStorage using the stored taskNum
        if ((!list || list.length === 0) && localStorage.getItem('taskNum')) {
            try {
                const fallbackKey = `pca_list_task_${localStorage.getItem('taskNum')}`;
                const fallback = JSON.parse(localStorage.getItem(fallbackKey) || '[]');
                if (fallback && fallback.length > 0) {
                    list = fallback;
                    // also persist into the session-scoped key so other helpers use it
                    try { savePCAs(list); } catch (e) {}
                }
            } catch (e) { /* ignore */ }
        }
        tableObj.rows = [];
        if (list.length === 0) {
            tableObj.tbody.innerHTML = `<tr><td colspan="5">You have not created any PCAs.</td></tr>`;
            return;
        }
        list.forEach(pca => {
            const nameHtml = `<a href="pca-projects.html" class="open-pca" data-id="${pca.id}">${escapeHtml(pca.name||'Untitled PCA')}</a>`;
            const actionsHtml = `
                <a href="#" class="action-link edit-pca" data-id="${pca.id}" title="Edit"><span class="material-icons">edit</span> <span class="action-text">Edit</span></a>
                <a href="#" class="action-link delete-pca" data-id="${pca.id}" title="Delete"><span class="material-icons">close</span> <span class="action-text">Delete</span></a>
                <a href="#" class="action-link submit-pca" data-id="${pca.id}" title="Submit"><span class="material-icons">send</span> <span class="action-text">Submit</span></a>
            `;
            tableObj.rows.push({
                Name: nameHtml,
                Status: pca.status || 'In progress',
                'Last modified': _formatDateNice(pca.lastModified),
                'Number of projects': `${(pca.projects||[]).length} of 3`,
                Action: actionsHtml
            });
        });
        tableObj.refreshTable();
    }

    // start new PCA -> open Start PCA lightbox
    const startLightbox = document.getElementById('start-pca-lightbox');
    const startForm = document.getElementById('start-pca-form');

    startBtn.addEventListener('click', () => {
        if (startLightbox) startLightbox.classList.add('open');
        const nameInput = document.getElementById('start-pca-name');
        if (nameInput) {
            nameInput.value = '';
            nameInput.focus();
        }
    });

    // handle Start PCA submission
    if (startForm) {
        startForm.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const name = (document.getElementById('start-pca-name')?.value || '').trim();
            if (!name) {
                alert('Please provide a name for this PCA.');
                return;
            }
            // Ensure taskNum is present in sessionStorage (fallback from localStorage)
            const taskNumFallback = sessionStorage.getItem('taskNum') || localStorage.getItem('taskNum');
            if (taskNumFallback && !sessionStorage.getItem('taskNum')) {
                sessionStorage.setItem('taskNum', taskNumFallback);
            }
            const list = getPCAs();
            const id = _generateId('pca');
            const now = new Date().toISOString();
            const newPca = { id, name: name, status: 'In progress', lastModified: now, projects: [] };
            list.unshift(newPca);
            savePCAs(list);
            // Persist current PCA id + name to session and local storage for reliable navigation
            try {
                sessionStorage.setItem('currentPCA', id);
                sessionStorage.setItem('currentPCAName', name);
                localStorage.setItem('currentPCA', id);
                localStorage.setItem('currentPCAName', name);
                // also ensure the proper task-scoped key exists in localStorage
                const pcaKey = _pcaStorageKey();
                try { localStorage.setItem(pcaKey, JSON.stringify(list)); } catch (e) {}
            } catch (e) {
                console.warn('Failed to persist current PCA identifiers', e);
            }
            // close and re-render the overview table (do not auto-navigate)
            startLightbox.classList.remove('open');
            render();
        });
    }

    // delegate actions
    tableBody.addEventListener('click', (e) => {
        const openBtn = e.target.closest('.open-pca');
            if (openBtn) {
            e.preventDefault();
            const id = openBtn.dataset.id;
            // store current PCA id and name as a session fallback
            sessionStorage.setItem('currentPCA', id);
            // store the visible link text as the PCA name (simple, reliable)
            try {
                const linkText = (openBtn.textContent || '').trim();
                if (linkText) {
                    sessionStorage.setItem('currentPCAName', linkText);
                    try { localStorage.setItem('currentPCA', id); localStorage.setItem('currentPCAName', linkText); } catch(e) {}
                    console.debug('Stored currentPCAName from link:', linkText);
                }
            } catch (e) { console.warn('Failed to save currentPCAName', e); }
            // ensure task identifiers and selectedTask persist across navigation
            const taskNum = sessionStorage.getItem('taskNum') || localStorage.getItem('taskNum');
            if (taskNum) {
                sessionStorage.setItem('taskNum', taskNum);
                try { localStorage.setItem('taskNum', taskNum); } catch (e) {}
            }
            if (!sessionStorage.getItem('selectedTask') && localStorage.getItem('selectedTask')) {
                sessionStorage.setItem('selectedTask', localStorage.getItem('selectedTask'));
            }
            // clear adding flags
            sessionStorage.removeItem('addingProject');
            window.location.href = 'pca-projects.html';
            return;
        }
        const editBtn = e.target.closest('.edit-pca');
        const delBtn = e.target.closest('.delete-pca');
        const submitBtn = e.target.closest('.submit-pca');
        if (editBtn) {
            editingPcaId = editBtn.dataset.id;
            const list = getPCAs();
            const pca = list.find(p => p.id === editingPcaId) || {};
            document.getElementById('edit-pca-name').value = pca.name || '';
            editLightbox.classList.add('open');
            return;
        }
        if (delBtn) {
            const id = delBtn.dataset.id;
            if (!confirm('Delete this PCA?')) return;
            let list = getPCAs();
            list = list.filter(p => p.id !== id);
            savePCAs(list);
            render();
            return;
        }
        if (submitBtn) {
            const id = submitBtn.dataset.id;
            const list = getPCAs();
            const pca = list.find(p => p.id === id);
            if (pca) {
                pca.status = 'Complete';
                pca.lastModified = new Date().toISOString();
                savePCAs(list);
                render();
            }
            return;
        }
    });

    // handle edit form
    editForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (!editingPcaId) return;
        const name = document.getElementById('edit-pca-name').value.trim() || 'Untitled PCA';
        const list = getPCAs();
        const pca = list.find(p => p.id === editingPcaId);
        if (pca) {
            pca.name = name;
            pca.lastModified = new Date().toISOString();
            savePCAs(list);
            render();
        }
        editingPcaId = null;
        editLightbox.classList.remove('open');
    });

    // close lightbox buttons
    document.querySelectorAll('[data-closebtn]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            const target = btn.getAttribute('data-closebtn');
            if (target) document.getElementById(target)?.classList.remove('open');
            else editLightbox.classList.remove('open');
        });
    });

    render();
}

function initPCAProjects() {
    const params = new URLSearchParams(window.location.search);
    let pcaId = params.get('pcaId');
    // fallback to sessionStorage then localStorage if the link didn't include pcaId
    const paramTaskNum = params.get('taskNum');
    if (paramTaskNum) {
        try { sessionStorage.setItem('taskNum', paramTaskNum); } catch (e) {}
        try { localStorage.setItem('taskNum', paramTaskNum); } catch (e) {}
    }
    if (!pcaId) pcaId = sessionStorage.getItem('currentPCA') || localStorage.getItem('currentPCA');
    if (!pcaId) {
        console.debug('initPCAProjects: no pcaId in URL or sessionStorage');
        // show message in table body if available
        const tableBodyFallback = document.querySelector('#pca-projects-tb tbody');
        if (tableBodyFallback) tableBodyFallback.innerHTML = `<tr><td colspan="3">No PCA selected.</td></tr>`;
        return;
    }
    const titleEl = document.getElementById('pca-title');
    const editBtn = document.getElementById('edit-pca-name-btn');
    const tableBody = document.querySelector('#pca-projects-tb tbody');
    const addBtn = document.getElementById('add-new-project');
    const countEl = document.getElementById('pca-project-count');
    const editLightbox = document.getElementById('edit-pca-lightbox');
    const editForm = document.getElementById('edit-pca-form');

    function load() {
        // populate header account info from stored task data (if any)
        populateHeaderFromTask();
        // Ensure session has taskNum so getPCAs reads the correct task-scoped key
        if (!sessionStorage.getItem('taskNum') && localStorage.getItem('taskNum')) {
            try { sessionStorage.setItem('taskNum', localStorage.getItem('taskNum')); } catch (e) {}
        }
        let list = getPCAs();
        if ((!list || list.length === 0) && localStorage.getItem('taskNum')) {
            try {
                const fallbackKey = `pca_list_task_${localStorage.getItem('taskNum')}`;
                const fallback = JSON.parse(localStorage.getItem(fallbackKey) || '[]');
                if (fallback && fallback.length > 0) {
                    list = fallback;
                    try { savePCAs(list); } catch (e) {}
                }
            } catch (e) {}
        }
        let pca = list.find(p => p.id === pcaId);
        if (!pca) {
            // try fallback search across all task lists
            pca = findPCAById(pcaId);
            if (pca) console.debug('initPCAProjects: found PCA in fallback search');
        }
        // Extra fallback: if PCA found but has no projects, search all task-scoped lists for a matching PCA that does
        if (pca && (!pca.projects || pca.projects.length === 0) && pcaId) {
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key || !key.startsWith('pca_list_task_')) continue;
                    try {
                        const arr = JSON.parse(localStorage.getItem(key) || '[]');
                        const found = arr.find(p => p.id === pcaId && p.projects && p.projects.length > 0);
                        if (found) {
                            pca = found;
                            console.debug('initPCAProjects: replaced PCA with one found in', key);
                            break;
                        }
                    } catch (e) { /* ignore parse errors */ }
                }
            } catch (e) { console.warn('Error during PCA cross-key search', e); }
        }
        if (!pca) {
            // If the PCA record isn't present, try using the session-stored name or localStorage as a fallback
            const fallbackName = sessionStorage.getItem('currentPCAName') || localStorage.getItem('currentPCAName');
            const pcaIdFallback = pcaId;
            if (!fallbackName) {
                tableBody.innerHTML = `<tr><td colspan="3">PCA not found.</td></tr>`;
                return;
            }
            // create a minimal PCA-like object for display
            pca = { id: pcaIdFallback, name: fallbackName, projects: [] };
        }
        // persist current PCA to session/local for downstream flows
        try {
            if (pca && pca.id) {
                sessionStorage.setItem('currentPCA', pca.id);
                sessionStorage.setItem('currentPCAName', pca.name || '');
                localStorage.setItem('currentPCA', pca.id);
                localStorage.setItem('currentPCAName', pca.name || '');
            }
        } catch (e) {}
        // ensure the H4 shows the PCA name next to the edit button without replacing the button
        const pcaNameH4 = document.getElementById('PCA-name');
        if (pcaNameH4) {
            let nameSpan = pcaNameH4.querySelector('.pca-name-text');
            if (!nameSpan) {
                nameSpan = document.createElement('span');
                nameSpan.className = 'pca-name-text';
                nameSpan.style.marginRight = '8px';
                const btn = document.getElementById('edit-pca-name-btn');
                if (btn) pcaNameH4.insertBefore(nameSpan, btn);
                else pcaNameH4.appendChild(nameSpan);
            }
            nameSpan.textContent = pca.name || 'Untitled PCA';
        }
        countEl.textContent = (pca.projects || []).length;
        tableBody.innerHTML = '';
        if (!pca.projects || pca.projects.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="3">No projects have been added to this PCA.</td></tr>`;
            return;
        }
        pca.projects.forEach((proj, idx) => {
            const tr = document.createElement('tr');
            const tdName = document.createElement('td');
            tdName.textContent = proj.name || `Project ${idx+1}`;
            const tdStatus = document.createElement('td');
            tdStatus.textContent = proj.status || 'In progress';
            const tdAction = document.createElement('td');
            tdAction.innerHTML = `
                <button class="btn-tertiary edit-project" data-index="${idx}" title="Edit"><span class="material-icons">edit</span>Edit</button>
                <button class="btn-tertiary delete-project" data-index="${idx}" title="Delete"><span class="material-icons">close</span>Delete</button>
            `;
            tr.appendChild(tdName);
            tr.appendChild(tdStatus);
            tr.appendChild(tdAction);
            tableBody.appendChild(tr);
        });
    }

    // edit PCA name
    editBtn.addEventListener('click', () => {
        const list = getPCAs();
        const pca = list.find(p => p.id === pcaId) || {};
        document.getElementById('edit-pca-name').value = pca.name || '';
        editLightbox.classList.add('open');
    });

    editForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const name = document.getElementById('edit-pca-name').value.trim() || 'Untitled PCA';
        const list = getPCAs();
        const pca = list.find(p => p.id === pcaId);
        if (pca) {
            pca.name = name;
            pca.lastModified = new Date().toISOString();
            savePCAs(list);
        }
        editLightbox.classList.remove('open');
        load();
    });

    // add new project -> launch stepper (index.html) with context stored
    addBtn.addEventListener('click', () => {
        // flag in sessionStorage for the stepper to know which PCA we're adding to
        sessionStorage.setItem('currentPCA', pcaId);
        sessionStorage.setItem('addingProject', 'true');
        // indicate this navigation is intentional so reload-detection won't clear session
        sessionStorage.setItem('navigatingToStepper', 'true');
        // ensure selectedTask is present in sessionStorage (copy from localStorage fallback)
        if (!sessionStorage.getItem('selectedTask') && localStorage.getItem('selectedTask')) {
            sessionStorage.setItem('selectedTask', localStorage.getItem('selectedTask'));
        }
        if (!sessionStorage.getItem('taskNum') && localStorage.getItem('taskNum')) {
            sessionStorage.setItem('taskNum', localStorage.getItem('taskNum'));
        }
        // set a persistent flag so the stepper page will accept navigation even if sessionStorage was cleared
        try { localStorage.setItem('allowStepper', Date.now().toString()); } catch (e) {}
        // navigate to stepper
        window.location.href = 'index.html';
    });

    // delegate project actions
    tableBody.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-project');
        const delBtn = e.target.closest('.delete-project');
        if (editBtn) {
            const idx = parseInt(editBtn.dataset.index, 10);
            const list = getPCAs();
            const pca = list.find(p => p.id === pcaId);
            const proj = pca.projects[idx];
            if (!proj) return;
            sessionStorage.setItem('currentPCA', pcaId);
            sessionStorage.setItem('addingProject', 'true');
            sessionStorage.setItem('editingProjectId', proj.id);
            sessionStorage.setItem('navigatingToStepper', 'true');
            try { localStorage.setItem('allowStepper', Date.now().toString()); } catch (e) {}
            window.location.href = `index.html?from=pca&editProjectId=${encodeURIComponent(proj.id)}`;
            return;
        }
        if (delBtn) {
            const idx = parseInt(delBtn.dataset.index, 10);
            if (!confirm('Delete this project?')) return;
            const list = getPCAs();
            const pca = list.find(p => p.id === pcaId);
            pca.projects.splice(idx, 1);
            pca.lastModified = new Date().toISOString();
            savePCAs(list);
            load();
            return;
        }
    });

    // close lightbox buttons
    document.querySelectorAll('[data-closebtn]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            const target = btn.getAttribute('data-closebtn');
            if (target) document.getElementById(target)?.classList.remove('open');
            else editLightbox.classList.remove('open');
        });
    });

    load();
}

// Auto-init PCA pages if present
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('pca-overview')) initPCAOverview();
    if (document.getElementById('pca-projects')) initPCAProjects();
});

// Populate header account info on all pages if task data exists
function populateHeaderFromTask() {
    let raw = sessionStorage.getItem('selectedTask');
    // fallback to localStorage if sessionStorage was not preserved across navigation
    if (!raw) raw = localStorage.getItem('selectedTask');
    if (!raw) return;
    try {
        const taskData = JSON.parse(raw);
        if (!taskData) return;
        const nameEl = document.getElementById('task-account-name');
        const bn9El = document.getElementById('task-account-bn9');
        const acct = taskData.accountInfo || {};
        if (nameEl) nameEl.textContent = acct.businessName || taskData.businessName || '';
        if (bn9El) bn9El.textContent = taskData.bn9 || acct.bn9 || acct.businessNumber || '';
    } catch (e) {
        console.warn('populateHeaderFromTask: invalid selectedTask');
    }
}

document.addEventListener('DOMContentLoaded', populateHeaderFromTask);

/* Save the current stepper form as a project inside the PCA (if session flags set) */
function saveCurrentProjectToPCA(markComplete = true) {
    const currentPCA = sessionStorage.getItem('currentPCA');
    const adding = sessionStorage.getItem('addingProject') === 'true';
    if (!adding || !currentPCA) return false;

    const list = getPCAs();
    const pca = list.find(p => p.id === currentPCA);
    if (!pca) return false;

    // Build project object from current form fields
    const now = new Date().toISOString();
    const editingProjectId = sessionStorage.getItem('editingProjectId');
    const proj = {
        id: editingProjectId || _generateId('proj'),
        name: (document.getElementById('projecttitle-field')?.value || '').trim() || 'Untitled project',
        status: markComplete ? 'Complete' : (pca.projects.find(project => project.id === editingProjectId)?.status || 'In progress'),
        created: pca.projects.find(project => project.id === editingProjectId)?.created || now,
        lastModified: now,
        data: {
            startDate: document.getElementById('startDate')?.value || '',
            projectLength: (document.querySelector('input[name="projectLength"]:checked')?.value) || '',
            fieldOfResearch: document.getElementById('fieldofR-field')?.value || '',
            categoryOfScience: document.getElementById('catofSci-field')?.value || '',
            fieldOfScience: (document.getElementById('fieldofSci-field')?.selectedOptions[0]?.textContent) || '',
            expenditure: document.getElementById('expenditure-field')?.value || '',
            uncertainty: document.getElementById('uncertainty-tb')?.value || '',
            duedilligence: document.getElementById('duedilligence-tb')?.value || '',
            hypothesis: document.getElementById('hypothesis-tb')?.value || '',
            solutions: document.getElementById('solutions-tb')?.value || '',
            experiments: document.getElementById('experiments-tb')?.value || '',
            factors: document.getElementById('factors-tb')?.value || '',
            success: document.getElementById('success-tb')?.value || '',
            documents: DataManager.getData('stepData_5')?.documents || []
        }
    };

    pca.projects = pca.projects || [];
    const existingProject = pca.projects.find(project => project.id === editingProjectId);
    if (!existingProject && pca.projects.length >= 3) {
        alert('This PCA already has the maximum of 3 projects.');
        return false;
    }

    if (existingProject) {
        Object.assign(existingProject, proj);
    } else {
        pca.projects.push(proj);
    }
    pca.lastModified = now;
    savePCAs(list);

    if (markComplete) {
        sessionStorage.setItem('confirmationPcaId', currentPCA);
    }

    // Clear adding flags
    sessionStorage.removeItem('addingProject');
    sessionStorage.removeItem('currentPCA');
    sessionStorage.removeItem('editingProjectId');

    return true;
}

/* Auto-start PCA from chooser: if flagged, create a new PCA on overview load */
function _handleAutoStartOnOverview() {
    if (sessionStorage.getItem('autoStartPCA') === 'true') {
        sessionStorage.removeItem('autoStartPCA');
        // find overview start button and focus it (do NOT auto-click to avoid immediate navigation)
        const startBtn = document.getElementById('start-new-pca');
        if (startBtn) {
            startBtn.focus();
            // add a subtle highlight class if desired (CSS may not exist)
            startBtn.classList.add('highlight-pulse');
            // remove highlight after a short period
            setTimeout(() => startBtn.classList.remove('highlight-pulse'), 1500);
        }
    }
}

// Hook auto-start when overview page loads
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('pca-overview')) {
        // small timeout to ensure initPCAOverview has run
        setTimeout(_handleAutoStartOnOverview, 100);
    }
});

// Ensure project page header and PCA name use any session fallbacks early
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('pca-projects')) return;
    // populate header from task data if available
    populateHeaderFromTask();
    // set PCA name if available from session fallback
    const fallbackName = sessionStorage.getItem('currentPCAName');
    if (fallbackName) {
        const pcaNameH4 = document.getElementById('PCA-name');
        if (pcaNameH4) {
            let nameSpan = pcaNameH4.querySelector('.pca-name-text');
            if (!nameSpan) {
                nameSpan = document.createElement('span');
                nameSpan.className = 'pca-name-text';
                nameSpan.style.marginRight = '8px';
                const btn = document.getElementById('edit-pca-name-btn');
                if (btn) pcaNameH4.insertBefore(nameSpan, btn);
                else pcaNameH4.appendChild(nameSpan);
            }
            nameSpan.textContent = fallbackName;
            console.debug('PCA name set from session fallback:', fallbackName);
        }
    }
});

// Also attempt to set the PCA name immediately in case DOMContentLoaded already fired earlier
(function immediatePCANameSet() {
    if (!document.getElementById('pca-projects')) return;
    const fallbackName = sessionStorage.getItem('currentPCAName');
    if (!fallbackName) return;
    const pcaNameH4 = document.getElementById('PCA-name');
    if (!pcaNameH4) return;
    let nameSpan = pcaNameH4.querySelector('.pca-name-text');
    if (!nameSpan) {
        nameSpan = document.createElement('span');
        nameSpan.className = 'pca-name-text';
        nameSpan.style.marginRight = '8px';
        const btn = document.getElementById('edit-pca-name-btn');
        if (btn) pcaNameH4.insertBefore(nameSpan, btn);
        else pcaNameH4.appendChild(nameSpan);
    }
    nameSpan.textContent = fallbackName;
    console.debug('Immediate PCA name set from session fallback:', fallbackName);
})();