import React, { useState, useEffect, useCallback } from 'react';
import { db, storage } from '../../firebase';
import { 
  collection, 
  addDoc, 
  Timestamp 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  listAll, 
  deleteObject 
} from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';
import ConfirmModal from '../Common/ConfirmModal';

const ClientCenterPage = ({ isManagedView = false, managedUserId = null, managedClientName = '' }) => {
    const { user, userData } = useAuth();
    const currentUserId = isManagedView ? managedUserId : user?.uid;
    
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState('');
    const [files, setFiles] = useState({});
    const [currentFolder, setCurrentFolder] = useState(null);
    const [loadingFiles, setLoadingFiles] = useState(true);
    const [storageError, setStorageError] = useState('');
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [fileToDelete, setFileToDelete] = useState(null);
    
    const folders = [
        { id: 'comprobantes', name: 'Comprobantes', acl: 'client' },
        { id: 'contratos', name: 'Contratos', acl: 'client' },
        { id: 'balances', name: 'Balances', acl: 'client' },
        { id: 'documentos_del_contador', name: 'Documentos del Contador', acl: 'accountant' },
    ];

    const handleFirebaseError = (error) => {
        console.error("Firebase Storage Error:", error);
        if (error.code === 'storage/unauthorized') {
            setStorageError('Error de permisos. Verifica las reglas de seguridad.');
        } else {
            setStorageError('Ocurrió un error inesperado al operar con los archivos.');
        }
    };
    
    const fetchFiles = useCallback(async () => {
        if (!currentUserId) return;
        setLoadingFiles(true);
        setStorageError('');
        try {
            const listRef = ref(storage, `user_documents/${currentUserId}`);
            const res = await listAll(listRef);
            
            const filesByFolder = {};
            folders.forEach(f => filesByFolder[f.id] = []);

            for (const folderRef of res.prefixes) {
                const folderName = folderRef.name;
                if (filesByFolder.hasOwnProperty(folderName)) {
                    const folderFiles = await listAll(folderRef);
                    filesByFolder[folderName] = await Promise.all(
                        folderFiles.items.map(async (itemRef) => ({
                            name: itemRef.name,
                            url: await getDownloadURL(itemRef),
                            fullPath: itemRef.fullPath
                        }))
                    );
                }
            }
            setFiles(filesByFolder);
        } catch (error) {
            handleFirebaseError(error);
        } finally {
            setLoadingFiles(false);
        }
    }, [currentUserId]);

    useEffect(() => { fetchFiles(); }, [fetchFiles]);
    
    const [uploadFolder, setUploadFolder] = useState(isManagedView ? 'documentos_del_contador' : 'comprobantes');

    const handleUpload = async () => {
        if (!file || !currentUserId) return;
        setUploading(true);
        setStorageError('');
        setMessage('');
        const storageRef = ref(storage, `user_documents/${currentUserId}/${uploadFolder}/${file.name}`);
        try {
            await uploadBytes(storageRef, file);
            setMessage({ type: 'success', text: 'Archivo subido con éxito.' }); 
            
            if (isManagedView && uploadFolder === 'documentos_del_contador') {
                const notifCollection = collection(db, 'users', currentUserId, 'notifications');
                await addDoc(notifCollection, {
                    title: "Nuevo Documento del Contador",
                    body: `Se ha subido el archivo: "${file.name}" a tu carpeta.`,
                    type: "info",
                    timestamp: Timestamp.now()
                });
            }
            
            setFile(null); 
            fetchFiles();
        } catch (error) { 
            setMessage({ type: 'error', text: 'Error al subir el archivo.' }); 
            handleFirebaseError(error);
        } finally { 
            setUploading(false); 
            setTimeout(() => setMessage(''), 3000); 
        }
    };
    
    const promptDelete = (filePath) => {
        setFileToDelete(filePath);
        setShowConfirmDelete(true);
    };

    const confirmDeleteFile = async () => {
        if (!fileToDelete) return;
        setStorageError('');
        const fileRef = ref(storage, fileToDelete);
        try {
            await deleteObject(fileRef);
            fetchFiles();
        } catch (error) {
            handleFirebaseError(error);
        } finally {
            setShowConfirmDelete(false);
            setFileToDelete(null);
        }
    };
    
    const canDelete = (folderId) => {
        const folder = folders.find(f => f.id === folderId);
        if (userData?.isAdmin) return true;
        if (folder?.acl === 'client') return true;
        return false;
    };

    if (currentFolder) {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex items-center gap-4">
                    <button onClick={() => setCurrentFolder(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <Icon name="ArrowLeft" className="w-6 h-6 text-gray-500"/>
                    </button>
                    <h2 className="text-2xl font-black text-gray-800">Carpeta: {folders.find(f => f.id === currentFolder)?.name}</h2>
                </div>

                <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                    {loadingFiles ? (
                        <div className="text-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                            <p className="text-gray-400 mt-4 font-medium">Cargando archivos...</p>
                        </div>
                    ) : files[currentFolder]?.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {files[currentFolder].map((f, idx) => (
                                <div key={idx} className="p-6 bg-gray-50 rounded-2xl border border-transparent hover:border-gray-100 hover:bg-white hover:shadow-lg transition-all group relative overflow-hidden">
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
                                            <Icon name="File" className="w-6 h-6"/>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-800 truncate" title={f.name}>{f.name}</p>
                                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs font-black text-blue-600 uppercase tracking-widest hover:underline mt-2 inline-block">
                                                Descargar
                                            </a>
                                        </div>
                                    </div>
                                    {canDelete(currentFolder) && (
                                        <button 
                                            onClick={() => promptDelete(f.fullPath)} 
                                            className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Icon name="Trash2" className="w-4 h-4"/>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20">
                            <Icon name="FolderOpen" className="w-16 h-16 text-gray-100 mx-auto mb-4"/>
                            <p className="text-gray-400 font-medium italic">No hay archivos en esta carpeta.</p>
                        </div>
                    )}
                </div>

                {showConfirmDelete && (
                    <ConfirmModal
                        message="¿Estás seguro de eliminar este archivo?"
                        confirmText="Eliminar"
                        isDestructive={true}
                        onConfirm={confirmDeleteFile}
                        onCancel={() => setShowConfirmDelete(false)}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="space-y-8 p-6 animate-fade-in">
            <header>
                <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Centro de Documentación</h2>
                <p className="text-gray-500 mt-1">Gestiona tus comprobantes y documentos contables de forma segura.</p>
            </header>

            <section className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                    <Icon name="UploadCloud" className="w-6 h-6 mr-3 text-blue-500"/>
                    Subir Nuevo Documento
                </h3>
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1 block">Seleccionar Carpeta</label>
                        <select 
                            value={uploadFolder} 
                            onChange={(e) => setUploadFolder(e.target.value)}
                            className="w-full p-3 bg-gray-50 border-transparent focus:ring-2 focus:ring-blue-100 rounded-xl transition-all outline-none font-medium text-gray-700"
                        >
                            {folders.filter(f => isManagedView ? f.acl === 'accountant' : f.acl === 'client').map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-[2] w-full">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1 block">Archivo</label>
                        <input 
                            type="file" 
                            onChange={(e) => setFile(e.target.files[0])}
                            className="w-full p-2.5 bg-gray-50 border-transparent focus:ring-2 focus:ring-blue-100 rounded-xl transition-all outline-none font-medium text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                    </div>
                    <button 
                        onClick={handleUpload} 
                        disabled={!file || uploading}
                        className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:bg-gray-300 disabled:shadow-none transition-all"
                    >
                        {uploading ? 'Subiendo...' : 'Subir'}
                    </button>
                </div>
                {message && (
                    <p className={`mt-4 text-center font-bold text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {message.text}
                    </p>
                )}
                {storageError && <p className="mt-4 text-center font-bold text-xs text-red-500 bg-red-50 p-3 rounded-xl border border-red-100">{storageError}</p>}
            </section>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                {folders.map(folder => (
                    <button 
                        key={folder.id} 
                        onClick={() => setCurrentFolder(folder.id)} 
                        className="p-8 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all group text-center flex flex-col items-center"
                    >
                        <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-blue-50 transition-colors mb-4">
                            <Icon name="Folder" className="h-12 w-12 text-blue-500 group-hover:scale-110 transition-transform"/>
                        </div>
                        <p className="font-bold text-gray-800">{folder.name}</p>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                            {files[folder.id]?.length || 0} Archivos
                        </p>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ClientCenterPage;
